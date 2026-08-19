"""
Tools the Strands agent can call.

**Return-of-control.** The backend reasons; the desktop app executes anything
that needs the user's disk. So `scan_folder` does not walk a filesystem — it
reads the folder digest the desktop app uploaded with the request. The scan
already happened on the user's machine before this code ran.

Per-request data reaches a tool through `agent.state`, which Strands injects
when a tool's signature asks for `agent`. That parameter is stripped from the
schema the model sees, so the model cannot pass it or even know it exists.

**Docstrings are prompts.** The first paragraph becomes the tool description and
the Args section becomes the parameter descriptions; together they are the only
thing the model reads when deciding whether to call a tool. They are written as
instructions to a model, not as notes to a maintainer.
"""

from __future__ import annotations

import datetime as _dt
import logging
import pathlib
from typing import Any, Optional

from strands import tool

from ..models.schemas import FileItem
from ..services import kernel
from ..services import gemini as gemini_svc
from ..services.heuristics import detect_sensitivity

logger = logging.getLogger(__name__)

# Keys under which the route and the tools pass data to each other.
#
# Intermediate results travel through agent.state rather than back through the
# model. A folder of 247 files would otherwise be retyped by the model into the
# next tool call — slow, expensive, and a chance to alter data in transit. The
# model orchestrates; the data stays server-side.
SCAN_CONTEXT_KEY = "scan_context"
CLASSIFICATIONS_KEY = "classifications"
PROPOSAL_KEY = "proposal"
PREFS_KEY = "preferences"
EXECUTION_PLAN_KEY = "execution_plan"
ESCALATION_KEY = "escalation"


def _state(agent: Any, key: str) -> Any:
    """Read a value the route or an earlier tool left in agent.state."""
    if agent is None:
        return None
    return agent.state.get(key)


def _set_state(agent: Any, key: str, value: Any) -> None:
    """Hand a result to a later tool without routing it through the model."""
    if agent is not None:
        agent.state.set(key, value)


def _folders(agent: Any) -> list[dict]:
    """Every watched folder in this request's digest, or an empty list."""
    if agent is None:
        return []
    ctx = agent.state.get(SCAN_CONTEXT_KEY) or {}
    return ctx.get("watched_folders") or []


def _match(folders: list[dict], wanted: str) -> Optional[dict]:
    """
    Find the folder the user meant.

    Matches on label then full path, exact before partial, so "Downloads"
    finds the folder labelled Downloads rather than "Downloads Archive".
    """
    want = (wanted or "").strip().lower().replace("/", "\\").rstrip("\\")
    if not want:
        return folders[0] if len(folders) == 1 else None

    for f in folders:
        if (f.get("label") or "").lower() == want:
            return f
    for f in folders:
        if (f.get("root") or "").lower().replace("/", "\\").rstrip("\\") == want:
            return f
    for f in folders:
        if want in (f.get("label") or "").lower() or want in (f.get("root") or "").lower():
            return f
    return None


@tool
def scan_folder(folder_name: str, agent=None) -> dict:
    """Look at what is in one of the user's folders and return a summary of it.

    Call this whenever you need to know what files someone has before you can
    answer them — how many files there are, how much space they use, which file
    types are present, or what the largest or oldest files are. Call it before
    making any claim about the contents of a folder.

    The counts in `total_files`, `total_bytes` and `by_extension` are COMPLETE
    and exact for the whole folder. Use them for any total. The `sample_largest`
    and `sample_newest` lists are short excerpts, never a full inventory — never
    count them to answer "how many".

    If the folder you were asked about is not being watched, this returns
    `found: false` along with the folders that are available. Tell the user
    which folders you can actually see rather than guessing about the one they
    named.

    Args:
        folder_name: Which folder to look at, as the user referred to it —
            either a short name like "Downloads" or a full path like
            "C:\\Users\\sam\\Downloads". Leave empty only if the user has just
            one watched folder and clearly means that one.
    """
    folders = _folders(agent)

    if not folders:
        logger.info("scan_folder: no digest in request")
        return {
            "found": False,
            "reason": "no_folders_watched",
            "available_folders": [],
            "message": (
                "No folders are being watched yet. Tell the user to add one in "
                "Settings under Scan Scope, and do not describe any folder contents."
            ),
        }

    match = _match(folders, folder_name)
    if match is None:
        available = [f.get("label") for f in folders]
        logger.info("scan_folder: %r not watched; have %s", folder_name, available)
        return {
            "found": False,
            "reason": "folder_not_watched",
            "requested": folder_name,
            "available_folders": available,
            "message": (
                f"'{folder_name}' is not one of the watched folders. "
                f"The folders available are: {', '.join(available)}."
            ),
        }

    logger.info(
        "scan_folder: %s -> %d files",
        match.get("label"), match.get("total_files", 0),
    )

    # Shape mirrors lib/folder-digests.ts::buildDigest. Samples are passed
    # through under names that say they are partial.
    return {
        "found": True,
        "folder": match.get("label"),
        "path": match.get("root"),
        "scanned_at": match.get("scanned_at"),
        "complete_counts": {
            "total_files": match.get("total_files", 0),
            "total_bytes": match.get("total_bytes", 0),
            "by_extension": match.get("by_extension") or {},
            "unchanged_over_a_year": match.get("stale_count", 0),
            "empty_files": match.get("empty_count", 0),
        },
        "sample_largest": match.get("sample_largest") or [],
        "sample_newest": match.get("sample_newest") or [],
        "all_files": match.get("all_files"),
        "all_files_truncated": bool(match.get("all_files_truncated")),
    }


# ─── Tier 1 — Observe ─────────────────────────────────────────────────────────
#
# Read-only. None of these touch the kernel, because none of them mutate.

@tool
def query_files(
    folder_name: str = "",
    extensions: str = "",
    name_contains: str = "",
    min_size_mb: float = 0,
    agent=None,
) -> dict:
    """Count and measure files matching a filter, without listing them all.

    Use this to answer "how many", "how much space", "do I have any" — anything
    that is a number rather than a list of names. Prefer it over reading a
    sample list, which is always partial.

    When `exact` comes back false, some folders were too large to search by
    name. Say so rather than implying the number covers everything.

    Args:
        folder_name: Which folder to look in. Empty means every watched folder.
        extensions: Comma-separated types without dots, e.g. "jpg,png". Empty
            means all types.
        name_contains: Only count files whose name contains this text.
        min_size_mb: Only count files at least this many megabytes. 0 for all.
    """
    folders = _folders(agent)
    if not folders:
        return {"found": False, "reason": "no_folders_watched", "matches": 0}

    if folder_name:
        match = _match(folders, folder_name)
        if match is None:
            return {
                "found": False, "reason": "folder_not_watched",
                "requested": folder_name,
                "available_folders": [f.get("label") for f in folders],
            }
        folders = [match]

    wanted = {e.strip().lower().lstrip(".") for e in extensions.split(",") if e.strip()}
    needle = name_contains.strip().lower()
    min_bytes = int(min_size_mb * 1024 * 1024)

    # With no name or size filter, the complete by_extension counts answer this
    # exactly and no file list is needed. That is what the aggregates are for.
    if not needle and min_bytes == 0:
        total_files = total_bytes = 0
        per_folder = {}
        for f in folders:
            by_ext = f.get("by_extension") or {}
            picked = {e: v for e, v in by_ext.items() if not wanted or e in wanted}
            n = sum(v.get("count", 0) for v in picked.values())
            b = sum(v.get("bytes", 0) for v in picked.values())
            total_files += n
            total_bytes += b
            per_folder[f.get("label")] = {"files": n, "bytes": b}
        return {
            "found": True, "exact": True,
            "matches": total_files, "total_bytes": total_bytes,
            "per_folder": per_folder,
        }

    # Name and size filters need the file list, which the digest only carries
    # for smaller folders.
    matches = total_bytes = 0
    incomplete = []
    for f in folders:
        files = f.get("all_files")
        if files is None:
            incomplete.append(f.get("label"))
            continue
        for item in files:
            name = (item.get("n") or "").lower()
            ext = name.rsplit(".", 1)[-1] if "." in name else ""
            if wanted and ext not in wanted:
                continue
            if needle and needle not in name:
                continue
            if item.get("s", 0) < min_bytes:
                continue
            matches += 1
            total_bytes += item.get("s", 0)

    return {
        "found": True,
        "exact": not incomplete,
        "matches": matches,
        "total_bytes": total_bytes,
        "folders_too_large_to_search": incomplete,
    }


@tool
def find_stale(folder_name: str = "", days: int = 365, agent=None) -> dict:
    """Find files nobody has changed in a long time.

    Use this for "what can I get rid of", "what is old", and before suggesting
    anything be archived.

    This reports when a file was last CHANGED, which is not when it was last
    opened or downloaded. Say "unchanged since", never "unused".

    Args:
        folder_name: Which folder to look in. Empty means all watched folders.
        days: How many days counts as stale. Defaults to a year.
    """
    folders = _folders(agent)
    if not folders:
        return {"found": False, "reason": "no_folders_watched", "stale_files": 0}

    if folder_name:
        match = _match(folders, folder_name)
        if match is None:
            return {
                "found": False, "reason": "folder_not_watched",
                "requested": folder_name,
                "available_folders": [f.get("label") for f in folders],
            }
        folders = [match]

    # The digest carries a complete count at the one-year threshold. Any other
    # threshold needs the file list, so be explicit about which was used.
    if days == 365:
        return {
            "found": True, "exact": True, "threshold_days": 365,
            "stale_files": sum(f.get("stale_count", 0) for f in folders),
            "per_folder": {f.get("label"): f.get("stale_count", 0) for f in folders},
            "oldest_examples": [
                s for f in folders for s in (f.get("sample_oldest") or [])
            ][:10],
        }

    cutoff = (_dt.date.today() - _dt.timedelta(days=days)).isoformat()
    total, incomplete, examples = 0, [], []
    for f in folders:
        files = f.get("all_files")
        if files is None:
            incomplete.append(f.get("label"))
            continue
        for item in files:
            if item.get("m") and item["m"] < cutoff:
                total += 1
                if len(examples) < 10:
                    examples.append(item)

    return {
        "found": True, "exact": not incomplete, "threshold_days": days,
        "cutoff_date": cutoff, "stale_files": total,
        "folders_too_large_to_search": incomplete,
        "oldest_examples": examples,
    }


@tool
def check_rules(agent=None) -> dict:
    """Read the filing rules this user wrote in their own words.

    Call this before proposing where anything should go. A rule the user wrote
    beats your own judgement — if one applies, follow it and say which one.

    An empty list is normal and means they have not written any yet.
    """
    rules = _state(agent, "rules") or []
    return {
        "rules": rules,
        "count": len(rules),
        "note": "No rules written yet — use your own judgement." if not rules else "",
    }


@tool
def recall_corrections(agent=None) -> dict:
    """Read the times this user corrected an earlier suggestion.

    Call this before proposing changes. If someone has already moved a kind of
    file somewhere once, they expect the same answer next time. Repeating a
    correction they already made is the fastest way to lose their trust.
    """
    hint = _state(agent, "corrections_hint") or ""
    return {
        "corrections": hint,
        "has_history": bool(hint),
        "note": "No corrections recorded yet." if not hint else "",
    }


# ─── Tier 2 — Reason ──────────────────────────────────────────────────────────
#
# Produce plans and judgements. Still nothing mutates.
#
# These pass their results through agent.state rather than back through the
# model. A folder of 247 files would otherwise be retyped by the model into the
# next tool call — slow, expensive, and a chance to alter data in transit. The
# model orchestrates; the data stays server-side.

@tool
async def classify_files(folder_name: str = "", limit: int = 60, agent=None) -> dict:
    """Work out what each file is and where it should go.

    Call this after scan_folder when the user wants files organised, sorted or
    tidied. It returns a summary rather than every file, because the detail is
    kept for propose_changes to use.

    Every classification carries a confidence score. Do not present low-scoring
    suggestions as settled — propose_changes decides what needs a human.

    Args:
        folder_name: Which folder to classify. Empty means the first watched one.
        limit: How many files to classify at most. Keep this modest; the user
            reviews the result.
    """
    folders = _folders(agent)
    if not folders:
        return {"ok": False, "reason": "no_folders_watched"}

    match = _match(folders, folder_name) if folder_name else folders[0]
    if match is None:
        return {
            "ok": False, "reason": "folder_not_watched",
            "requested": folder_name,
            "available_folders": [f.get("label") for f in folders],
        }

    listing = match.get("all_files")
    if not listing:
        return {
            "ok": False,
            "reason": "no_file_list",
            "folder": match.get("label"),
            "total_files": match.get("total_files", 0),
            "message": (
                "That folder holds too many files for the desktop app to have sent "
                "the full list. Say so and suggest organising a smaller folder."
            ),
        }

    items = [
        FileItem(
            id=str(i),
            name=f.get("n", ""),
            extension=("." + f["n"].rsplit(".", 1)[-1]) if "." in f.get("n", "") else "",
            size=f.get("s", 0),
            relative_path=f.get("p", ""),
        )
        for i, f in enumerate(listing[:limit])
    ]
    if not items:
        return {"ok": False, "reason": "no_files", "folder": match.get("label")}

    results, _usage = await gemini_svc.classify_batch(items, user_id=None, endpoint="/agent/v2")

    by_id = {i.id: i for i in items}
    detail = []
    for r in results:
        src = by_id.get(r.id)
        if src is None:
            continue
        detail.append({
            "name": src.name,
            "path": src.relative_path,
            "category": r.category,
            "new_name": r.new_name,
            "target_folder": r.target_folder,
            "confidence": r.confidence,
            "reason": r.reason,
            "sensitivity": r.sensitivity,
        })

    # Kept for propose_changes; deliberately not returned through the model.
    _set_state(agent, CLASSIFICATIONS_KEY, {"folder": match.get("label"), "files": detail})

    categories: dict[str, int] = {}
    for d in detail:
        categories[d["category"]] = categories.get(d["category"], 0) + 1

    return {
        "ok": True,
        "folder": match.get("label"),
        "classified": len(detail),
        "categories": categories,
        "average_confidence": round(sum(d["confidence"] for d in detail) / len(detail), 2) if detail else 0,
        "note": "Detail is held for propose_changes. Do not list every file back to the user.",
    }


@tool
def check_sensitive(agent=None) -> dict:
    """Flag anything private among the files just classified.

    Call this after classify_files and before proposing anything. Passports,
    bank statements and ID scans must never be moved on someone's behalf
    without asking, however confident the classification was.

    Returns the count and the categories found, not the filenames — do not read
    a list of someone's private documents back to them unless they ask.
    """
    data = _state(agent, CLASSIFICATIONS_KEY) or {}
    files = data.get("files") or []
    if not files:
        return {
            "ok": False,
            "reason": "nothing_classified_yet",
            "message": "Call classify_files first.",
        }

    flagged = []
    for f in files:
        # The classifier's own judgement, plus a filename check that does not
        # depend on the model having noticed.
        level = f.get("sensitivity", "none")
        heuristic = detect_sensitivity(f.get("name", ""))
        if heuristic != "none":
            level = heuristic
        if level != "none":
            f["sensitivity"] = level
            flagged.append({"name": f.get("name"), "kind": level})

    _set_state(agent, CLASSIFICATIONS_KEY, data)

    kinds: dict[str, int] = {}
    for f in flagged:
        kinds[f["kind"]] = kinds.get(f["kind"], 0) + 1

    return {
        "ok": True,
        "checked": len(files),
        "sensitive_files": len(flagged),
        "kinds": kinds,
        "note": (
            "These must be escalated to the user, never applied automatically."
            if flagged else "Nothing private found."
        ),
    }


@tool
def propose_changes(agent=None) -> dict:
    """Decide which changes can be made automatically and which need the user.

    Call this last, after classify_files and check_sensitive. It sorts every
    proposed change into one of three outcomes using the user's own thresholds:

      auto     — confident enough, and nothing private. Safe to apply.
      review   — plausible but worth a glance before applying.
      escalate — too uncertain, or the file is private. Needs a decision.

    Report the counts to the user and say plainly what you would apply and what
    you want them to look at. Nothing is applied here; this only decides.
    """
    data = _state(agent, CLASSIFICATIONS_KEY) or {}
    files = data.get("files") or []
    if not files:
        return {
            "ok": False,
            "reason": "nothing_classified_yet",
            "message": "Call classify_files first.",
        }

    prefs = _state(agent, PREFS_KEY) or {}
    auto_at = float(prefs.get("auto_threshold", 0.85))
    review_at = float(prefs.get("review_threshold", 0.70))

    buckets = {"auto": [], "review": [], "escalate": []}
    for f in files:
        confidence = float(f.get("confidence", 0))
        sensitive = f.get("sensitivity", "none") != "none"

        if sensitive:
            # Confidence is irrelevant here. A correct guess about someone's
            # passport is still a decision that belongs to them.
            disposition = "escalate"
            why = f"private ({f.get('sensitivity')})"
        elif confidence >= auto_at:
            disposition = "auto"
            why = f"confident ({confidence:.2f})"
        elif confidence >= review_at:
            disposition = "review"
            why = f"fairly confident ({confidence:.2f})"
        else:
            disposition = "escalate"
            why = f"not confident ({confidence:.2f})"

        f["disposition"] = disposition
        f["why"] = why
        buckets[disposition].append(f)

    data["files"] = files
    data["thresholds"] = {"auto_at": auto_at, "review_at": review_at}
    _set_state(agent, PROPOSAL_KEY, data)

    return {
        "ok": True,
        "folder": data.get("folder"),
        "total": len(files),
        "auto": len(buckets["auto"]),
        "review": len(buckets["review"]),
        "escalate": len(buckets["escalate"]),
        "thresholds": {"auto_at": auto_at, "review_at": review_at},
        "escalation_reasons": [f["why"] for f in buckets["escalate"]][:10],
        "examples": {
            k: [{"name": f["name"], "to": f["target_folder"], "why": f["why"]}
                for f in v[:3]]
            for k, v in buckets.items() if v
        },
        "note": "Nothing has been changed. This is a decision, not an action.",
    }


# ─── Tier 3 — Act ─────────────────────────────────────────────────────────────
#
# Everything here either mutates the filesystem or creates authority to. Two
# separate protections apply, and they are not the same thing:
#
#   The hook decides whether to ASK the user      (policy — see approval.py)
#   The kernel decides what is PHYSICALLY PERMITTED (services/kernel.py)
#
# A hook failing to register must never produce an unsafe operation, so the
# kernel is called unconditionally inside the tool rather than around it.
#
# Return-of-control: these tools do not touch a disk. The server cannot reach
# C:\Users\...\Downloads. They validate, journal, and return a plan the desktop
# app executes behind its own independent guard.

def _plan_from(files: list[dict], scan_root: str = "") -> tuple[list[dict], list[dict]]:
    """
    Turn proposed changes into kernel-approved operations.

    Returns (approved, refused). Anything the kernel refuses is dropped with its
    reason rather than silently skipped — a refusal the user never sees is how
    they end up believing something moved when it did not.
    """
    approved, refused = [], []

    for f in files:
        src = f.get("path") or ""
        target = f.get("target_folder") or ""
        new_name = f.get("new_name") or f.get("name") or ""
        if not src or not target:
            refused.append({"name": f.get("name"), "reason": "incomplete proposal"})
            continue

        # kernel.join keeps the user's path flavour. pathlib.Path here would
        # follow the server's OS and quietly produce a relative path.
        dst = str(kernel.join(kernel.canonical(src).parent, target, new_name))

        try:
            op = kernel.guard(
                kernel.Operation(type="move", src=src, dst=dst, scan_root=scan_root),
            )
            approved.append({
                "type": "move_file",
                "name": f.get("name"),
                "source": op.src,
                "destination": op.dst,
                "reason": f.get("reason", ""),
            })
        except kernel.KernelRefusal as refusal:
            logger.info("kernel refused %s: %s", f.get("name"), refusal.reason)
            refused.append({"name": f.get("name"), "reason": refusal.reason})

    return approved, refused


@tool
def apply_changes(disposition: str = "auto", agent=None) -> dict:
    """Prepare the approved changes so the user's computer can carry them out.

    Call this only after propose_changes, and only for changes the user has
    agreed to. By default it applies just the "auto" set — the ones confident
    enough not to need a decision.

    Nothing here is deleted and nothing is overwritten. Every change is checked
    and recorded before it runs, so all of it can be undone afterwards.

    Args:
        disposition: Which set to apply — "auto" for the confident ones, or
            "review" once the user has looked at those. Never pass "escalate";
            those are waiting on a decision that has not been made.
    """
    proposal = _state(agent, PROPOSAL_KEY) or {}
    files = proposal.get("files") or []
    if not files:
        return {
            "ok": False, "reason": "nothing_proposed",
            "message": "Call propose_changes first.",
        }

    wanted = [f for f in files if f.get("disposition") == disposition]
    if not wanted:
        return {
            "ok": False, "reason": "nothing_in_that_set",
            "disposition": disposition,
            "available": {
                d: sum(1 for f in files if f.get("disposition") == d)
                for d in ("auto", "review", "escalate")
            },
        }

    approved, refused = _plan_from(wanted, proposal.get("scan_root", ""))
    _set_state(agent, EXECUTION_PLAN_KEY, {"operations": approved})

    return {
        "ok": True,
        "disposition": disposition,
        "operations_ready": len(approved),
        "refused_by_safety_checks": refused,
        "note": (
            "These are ready for the user's computer to carry out. Tell them what "
            "will happen and that it can be undone. Do not claim it has happened yet."
        ),
    }


@tool
def quarantine(reason: str = "", agent=None) -> dict:
    """Move files out of the way into the Archive, without deleting them.

    Use this for "archive it", "put it away", "I don't need it now but don't
    delete it". The file keeps existing and can be restored later.

    This is not deleting. There is no tool that deletes, because this
    application does not delete files.

    Args:
        reason: Why these are being archived, in a few words, for the history.
    """
    proposal = _state(agent, PROPOSAL_KEY) or {}
    files = [f for f in (proposal.get("files") or []) if f.get("disposition") == "auto"]
    if not files:
        return {
            "ok": False, "reason": "nothing_to_archive",
            "message": "Call propose_changes first, or nothing qualified.",
        }

    operations, refused = [], []
    for f in files:
        src = f.get("path") or ""
        if not src:
            continue
        try:
            # Validated the same way a move is; archiving is a move with a
            # destination the kernel chooses.
            canonical = kernel.canonical(src)
            if kernel.is_protected(canonical):
                raise kernel.BlockedPath(str(canonical))
            operations.append({
                "type": "archive", "name": f.get("name"), "path": str(canonical),
            })
        except kernel.KernelRefusal as refusal:
            refused.append({"name": f.get("name"), "reason": refusal.reason})

    _set_state(agent, EXECUTION_PLAN_KEY, {"operations": operations})
    return {
        "ok": True,
        "to_archive": len(operations),
        "refused_by_safety_checks": refused,
        "reason": reason,
        "note": "Nothing is deleted. These can be restored from the Archive page.",
    }


@tool
def notify_user(
    reason: str,
    agent_note: str,
    options: str = "",
    agent=None,
) -> dict:
    """Stop and ask the user a question you cannot answer on their behalf.

    Interrupting someone has a cost, so use this only when you genuinely cannot
    proceed: a private document, a change you are not confident about, or two
    instructions that conflict.

    Say plainly what you found and what you would do, and offer them a small
    number of concrete choices. Do not ask an open question when you could
    offer options.

    Args:
        reason: Why you stopped — "sensitive", "low_confidence" or "conflict".
        agent_note: What you found and what you propose, in your own words,
            written for the user to read.
        options: The choices you are offering, comma-separated, for example
            "Move them anyway, Leave them where they are, Ask me per file".
    """
    proposal = _state(agent, PROPOSAL_KEY) or {}
    escalating = [
        {"name": f.get("name"), "path": f.get("path"),
         "why": f.get("why"), "target": f.get("target_folder")}
        for f in (proposal.get("files") or [])
        if f.get("disposition") == "escalate"
    ]

    choices = [o.strip() for o in options.split(",") if o.strip()]
    pending = {
        "reason": reason,
        "agent_note": agent_note,
        "options": choices,
        "file_refs": escalating,
    }
    _set_state(agent, ESCALATION_KEY, pending)

    logger.info("notify_user: %s — %d file(s)", reason, len(escalating))
    return {
        "ok": True,
        "raised": True,
        "reason": reason,
        "files_awaiting_decision": len(escalating),
        "options": choices,
        "note": "The user has been asked. Do not act on these until they answer.",
    }
