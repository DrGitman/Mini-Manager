"""
Rules — what the user told the agent to do, in their own words.

A rule is one sentence a person typed. This module turns it into something the
rest of the system can act on, and the central decision is *who acts on it*:

  filing, autonomy, protect, retention   → the agent reads these
  schedule, notify                       → deterministic code reads these

That split is the whole design. A filing rule can stay vague because a language
model interprets it at the moment it matters, and "put invoices somewhere sensible
in Finance" is a perfectly good instruction to a model. But nothing interprets a
schedule rule: `/runs/due` is arithmetic on timestamps, and the mailer is an SMTP
call. Neither has a model in the loop, so "every second Tuesday" must become
numbers before it is worth anything.

Which leads to the rule that matters most here: **a rule that could not be
compiled must say so.** The failure mode we are avoiding is a user typing "email
me every morning", seeing it appear in a list of rules, and believing it. If the
compiler cannot produce a schedule from a sentence, the rule is stored with an
error and surfaced as broken, because a rule that silently does nothing is worse
than no rule — the user has stopped worrying about something that is not handled.

Compilation is Gemini with a deterministic fallback. Common phrasings ("every 2
hours", "email me the results") are matched by pattern first, because a rule the
user can see working without a network round trip is a better rule, and because
the model being briefly unavailable should not mean their schedule stops.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional

from ..config import settings

logger = logging.getLogger(__name__)

# The kinds. Anything the compiler cannot place lands in "filing", which is the
# historical behaviour and the safest default — it reaches the agent, which can
# reason about an odd instruction, rather than a scheduler that cannot.
#
# "naming" is kept separate from "filing" on purpose: where a file goes and what
# it is called are different decisions, carry different risk, and a user may
# well trust the agent with one and not the other.
KINDS = ("filing", "naming", "schedule", "notify", "autonomy",
         "protect", "retention", "sensitivity")

# Floor on how often a scheduled run may happen. Someone writing "scan every
# minute" gets 15 minutes, because the device polls on that cadence anyway and a
# shorter interval would just mean every poll triggers a full agent run.
MIN_INTERVAL_MINUTES = 15
DEFAULT_INTERVAL_HOURS = 6

WEEKDAYS = {
    "monday": 0, "mon": 0, "tuesday": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wed": 2, "thursday": 3, "thu": 3, "thurs": 3,
    "friday": 4, "fri": 4, "saturday": 5, "sat": 5, "sunday": 6, "sun": 6,
}


# ─── Compilation ──────────────────────────────────────────────────────────────

_COMPILE_SYSTEM = """\
You compile one natural-language rule a person wrote for their file-organising \
agent into a JSON object. Return ONLY JSON — no markdown, no prose.

First decide which KIND of rule it is:

- "filing"      — WHERE a file should go
- "naming"      — WHAT a file should be called once it is there
- "schedule"    — when or how often the agent should run
- "notify"      — how the person wants to be told what happened
- "autonomy"    — how confident or cautious the agent should be before acting
- "protect"     — files or folders the agent must never touch
- "retention"   — archiving or cleaning up old and unused files
- "sensitivity" — what counts as private, beyond the obvious ID and bank documents

"filing" and "naming" are different. "Put invoices in Finance" is filing.
"Always put the date first" is naming. A rule doing both is filing, with the
naming expressed in action.rename_pattern.

Then emit the object for that kind.

filing:
{"kind":"filing","pattern":{"name_contains":["invoice"],"extensions":[".pdf"],
 "folder_contains":null},"action":{"target_folder":"Finance","rename_pattern":null},
 "description":"..."}

schedule:
{"kind":"schedule","every_minutes":120,"at_times":["09:00"],
 "days":[0,1,2,3,4],"quiet_hours":null,"description":"..."}
  every_minutes: fixed interval in minutes, or null if the rule gives clock times
  at_times: "HH:MM" 24-hour times, or [] if the rule gives an interval
  days: 0=Monday..6=Sunday. Use all seven unless the rule limits them.
  quiet_hours: {"from":"22:00","to":"07:00"} if the rule forbids a window, else null

notify:
{"kind":"notify","channel":"email","when":"always","address":null,
 "digest":false,"description":"..."}
  channel: "email" | "desktop" | "none"
  when: "always" | "escalations_only" | "changes_only" | "never"
        escalations_only = only when the agent needs a decision
        changes_only     = only when it actually moved something
  address: an email address if the rule names one, else null
  digest: true if the rule asks for a periodic summary rather than per-run mail

autonomy:
{"kind":"autonomy","auto_threshold":0.95,"review_threshold":null,
 "always_ask":false,"scope_folder":null,"description":"..."}
  auto_threshold: 0..1 confidence needed to act without asking, or null
  always_ask: true if the rule says never act without confirmation
  scope_folder: folder name if the rule applies to only one, else null

protect:
{"kind":"protect","paths":["Projects"],"name_contains":["tax"],
 "extensions":[],"description":"..."}

retention:
{"kind":"retention","older_than_days":365,"action":"archive",
 "extensions":[],"keep_forever":[],"description":"..."}
  action: "archive" | "quarantine" | "flag"
  keep_forever: filename keywords never to touch regardless of age, e.g. ["tax"]

naming:
{"kind":"naming","date_first":true,"date_format":"YYYY-MM-DD",
 "separator":"_","strip":["(1)","Copy of"],"keep_original":true,
 "scope_folder":null,"description":"..."}
  separator: "_" | "-" | " " | null if the rule does not say
  strip: substrings to remove from filenames
  keep_original: false only if the rule asks for the old name to be discarded

sensitivity:
{"kind":"sensitivity","treat_as_private":{"folders":["Contracts"],
 "name_contains":[],"extensions":[]},
 "not_private":{"name_contains":["receipt"]},"description":"..."}
  treat_as_private: things to flag that the built-in checks would miss
  not_private: things the user says are NOT private despite looking it
  Use empty lists for whichever side the rule does not mention.

If the text is not an instruction at all — gibberish, an empty phrase, a
question, or a statement with no action in it — return exactly:
{"kind":"unknown","description":"","error":"This does not read as a rule."}

Never force unrecognisable text into one of the six kinds. Returning "unknown"
is always better than guessing, because a wrong guess silently changes how the
agent treats someone's files.

Rules:
- Output exactly one object.
- description is always one plain-English sentence starting with a verb.
- Never invent a folder, address or number the rule does not imply.
"""


async def compile_rule(rule_text: str) -> dict:
    """
    Turn one sentence into a structured rule.

    Tries the deterministic patterns first — they are instant, free, and cover
    the phrasings people actually use — then falls back to the model. A rule
    that neither can parse comes back with `error` set so the UI can show it as
    broken rather than pretending it works.
    """
    text = (rule_text or "").strip()
    if not text:
        return {"kind": "filing", "error": "the rule is empty", "description": ""}

    quick = _compile_locally(text)
    if quick is not None:
        quick["compiled_by"] = "pattern"
        return quick

    viaModel = await _compile_with_model(text)
    if viaModel is not None:
        viaModel["compiled_by"] = "model"
        return viaModel

    # Unparseable. Store it as filing so the agent still sees the sentence, but
    # mark it so nothing deterministic silently ignores it.
    logger.info("rule did not compile: %r", text[:80])
    return {
        "kind": "filing",
        "description": text[:200],
        "error": "This rule could not be turned into something automatic.",
        "compiled_by": "none",
    }


def _compile_locally(text: str) -> Optional[dict]:
    """
    Handle the phrasings people actually type, without a network call.

    Deliberately narrow: it only claims a rule when the match is unambiguous.
    Anything clever is left to the model, because a wrong local parse is far
    worse than a slow correct one — it produces a schedule the user never asked
    for and silently obeys it.
    """
    t = text.lower().strip()

    # ── schedule: "every 2 hours" / "every 30 minutes" / "hourly" / "daily" ──
    m = re.search(r"\bevery\s+(\d+)\s*(minute|min|hour|hr|day)s?\b", t)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        minutes = n * (1 if unit.startswith("min") else 60 if unit.startswith("h") else 1440)
        return _schedule(every_minutes=max(minutes, MIN_INTERVAL_MINUTES),
                         days=_days_in(t), description=f"Run every {n} {unit}{'s' if n != 1 else ''}.")

    # Bare units with no number — "every minute", "every hour".
    if re.search(r"\bevery\s+minute\b", t):
        return _schedule(every_minutes=MIN_INTERVAL_MINUTES, days=_days_in(t),
                         description=f"Run as often as possible "
                                     f"(every {MIN_INTERVAL_MINUTES} minutes).")
    if re.search(r"\b(hourly|every hour)\b", t):
        return _schedule(every_minutes=60, days=_days_in(t), description="Run every hour.")
    if re.search(r"\b(daily|every day|once a day)\b", t) and "at" not in t:
        return _schedule(every_minutes=1440, days=_days_in(t), description="Run once a day.")

    # ── schedule: "every morning at 9" / "at 09:00" / "at 9am on weekdays" ───
    times = _times_in(t)
    if times and re.search(r"\b(at|every|each)\b", t) and not _is_notify(t):
        days = _days_in(t)
        return _schedule(every_minutes=None, at_times=times, days=days,
                         description=f"Run at {', '.join(times)}"
                                     f"{'' if len(days) == 7 else ' on selected days'}.")

    # ── notify: email ────────────────────────────────────────────────────────
    if _is_notify(t) and "email" in t:
        addr = _address_in(text)
        when = ("escalations_only" if re.search(
                    r"\b(decision|decide|escalat|need.*(me|you)|ask|private|sensitive)\b", t)
                else "changes_only" if re.search(r"\b(only if|when.*(mov|chang|organis|organiz))\b", t)
                else "always")
        return {
            "kind": "notify", "channel": "email", "when": when,
            "address": addr, "digest": bool(re.search(r"\b(digest|summary|weekly|daily summary)\b", t)),
            "description": ("Email me when the agent needs a decision."
                            if when == "escalations_only"
                            else "Email me only when files were actually moved."
                            if when == "changes_only" else "Email me after every run."),
        }

    if _is_notify(t) and re.search(r"\b(don'?t|do not|never|stop)\b", t):
        return {"kind": "notify", "channel": "none", "when": "never", "address": None,
                "digest": False, "description": "Do not notify me."}

    return None


def _is_notify(t: str) -> bool:
    return bool(re.search(r"\b(email|e-mail|mail|notify|notification|tell me|let me know|send me)\b", t))


def _schedule(every_minutes: Optional[int], description: str,
              at_times: Optional[list[str]] = None,
              days: Optional[list[int]] = None) -> dict:
    return {
        "kind": "schedule",
        "every_minutes": every_minutes,
        "at_times": at_times or [],
        "days": days if days is not None else [0, 1, 2, 3, 4, 5, 6],
        "quiet_hours": None,
        "description": description,
    }


def _days_in(t: str) -> list[int]:
    """Which weekdays a rule mentions. All seven when it does not narrow them."""
    if re.search(r"\bweekdays?\b|\bwork(ing)? days\b|\bmon(day)?\s*(-|to|through)\s*fri(day)?\b", t):
        return [0, 1, 2, 3, 4]
    if re.search(r"\bweekends?\b", t):
        return [5, 6]
    found = sorted({n for word, n in WEEKDAYS.items()
                    if re.search(rf"\b{word}\b", t)})
    return found or [0, 1, 2, 3, 4, 5, 6]


def _times_in(t: str) -> list[str]:
    """Clock times mentioned, normalised to HH:MM."""
    out: list[str] = []
    for m in re.finditer(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", t):
        hour = int(m.group(1)) % 12
        if m.group(3) == "pm":
            hour += 12
        out.append(f"{hour:02d}:{int(m.group(2) or 0):02d}")
    for m in re.finditer(r"\b(\d{1,2}):(\d{2})\b(?!\s*(am|pm))", t):
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            out.append(f"{h:02d}:{mi:02d}")

    # A bare hour, but only directly after "at" — "every morning at 9" means
    # 09:00, while "every 2 hours" must not be read as 02:00. Requiring the
    # preposition is what separates the two.
    if not out:
        for m in re.finditer(r"\bat\s+(\d{1,2})\b(?!\s*[:.]?\d)(?!\s*(am|pm))", t):
            h = int(m.group(1))
            if 0 <= h <= 23:
                # "at 7" in a sentence about mornings means 07:00; about
                # evenings, 19:00. Left alone otherwise.
                if h < 12 and re.search(r"\b(evening|night|pm)\b", t):
                    h += 12
                out.append(f"{h:02d}:00")

    # "every morning" / "every evening" only count when no clock time was given,
    # so "every morning at 9" does not produce both 08:00 and 09:00.
    if not out:
        if "morning" in t:
            out.append("08:00")
        elif "evening" in t or "night" in t:
            out.append("19:00")
        elif "afternoon" in t:
            out.append("14:00")
    return sorted(set(out))


def _address_in(text: str) -> Optional[str]:
    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    return m.group(0) if m else None


async def _compile_with_model(text: str) -> Optional[dict]:
    """Ask Gemini to classify and structure the rule. None if it cannot."""
    try:
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=settings.gemini_api_key)
        resp = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=f'Rule: "{text}"',
            config=genai_types.GenerateContentConfig(
                system_instruction=_COMPILE_SYSTEM,
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        data = json.loads((resp.text or "").strip())
    except Exception as exc:                            # noqa: BLE001
        logger.warning("rule compile via model failed: %s", exc)
        return None

    if not isinstance(data, dict):
        return None

    # The model saying "this is not a rule" is a real answer, not a failure.
    # Returning None here would send it to the unparseable path, which stores it
    # as a filing rule the agent then tries to honour.
    if data.get("kind") == "unknown":
        return {"kind": "filing", "description": "",
                "error": data.get("error") or "This does not read as a rule."}

    if data.get("kind") not in KINDS:
        return None
    return _sanitise(data)


def _sanitise(data: dict) -> dict:
    """
    Clamp a model's output into ranges the rest of the system can trust.

    The model is asked for numbers and mostly gives sensible ones, but "every
    minute" or a threshold of 4.0 would otherwise propagate into a scheduler and
    a confidence comparison that have no defence of their own.
    """
    kind = data.get("kind")

    if kind == "schedule":
        ev = data.get("every_minutes")
        if isinstance(ev, (int, float)) and ev > 0:
            data["every_minutes"] = max(int(ev), MIN_INTERVAL_MINUTES)
        else:
            data["every_minutes"] = None
        data["at_times"] = [t for t in (data.get("at_times") or [])
                            if isinstance(t, str) and re.match(r"^\d{2}:\d{2}$", t)]
        days = data.get("days")
        data["days"] = ([d for d in days if isinstance(d, int) and 0 <= d <= 6]
                        if isinstance(days, list) and days else [0, 1, 2, 3, 4, 5, 6])
        if data["every_minutes"] is None and not data["at_times"]:
            # A rule that only narrows the days — "only run at weekends" — is a
            # complete instruction, not a broken one. Treating it as an error
            # meant falling back to the default schedule with the day
            # restriction dropped, so the agent ran on Monday for someone who
            # had explicitly asked it not to. Keep the days, supply the cadence.
            if len(data["days"]) < 7:
                data["every_minutes"] = DEFAULT_INTERVAL_HOURS * 60
            else:
                data["error"] = "This schedule has neither an interval nor a time of day."

    if kind == "autonomy":
        for key in ("auto_threshold", "review_threshold"):
            v = data.get(key)
            data[key] = min(max(float(v), 0.0), 1.0) if isinstance(v, (int, float)) else None

    if kind == "notify":
        if data.get("channel") not in ("email", "desktop", "none"):
            data["channel"] = "email"
        if data.get("when") not in ("always", "escalations_only", "changes_only", "never"):
            data["when"] = "always"

    if kind == "retention":
        d = data.get("older_than_days")
        data["older_than_days"] = int(d) if isinstance(d, (int, float)) and d > 0 else 365
        # "delete" is not an option and never becomes one. A retention rule can
        # only ever archive, quarantine or flag, so a model that emits
        # "delete" — or a user who asks for it — lands on the safe end.
        if data.get("action") not in ("archive", "quarantine", "flag"):
            data["action"] = "flag"

    if kind == "sensitivity":
        for side, keys in (("treat_as_private", ("folders", "name_contains", "extensions")),
                           ("not_private", ("name_contains",))):
            block = data.get(side)
            block = block if isinstance(block, dict) else {}
            data[side] = {k: [str(x) for x in (block.get(k) or []) if str(x).strip()]
                          for k in keys}
        if not any(data["treat_as_private"].values()) and not data["not_private"]["name_contains"]:
            data["error"] = "This rule does not name anything to treat differently."

    if kind == "naming":
        if data.get("separator") not in ("_", "-", " ", None):
            data["separator"] = None
        data["strip"] = [str(x) for x in (data.get("strip") or []) if str(x).strip()]
        data["date_first"] = bool(data.get("date_first"))
        data["keep_original"] = data.get("keep_original") is not False

    return data


# ─── Evaluation ───────────────────────────────────────────────────────────────
#
# Everything below is deterministic. No model is consulted, because these run on
# a schedule with nobody watching.

def active_of_kind(rules: list[dict], kind: str) -> list[dict]:
    """Compiled bodies of every active rule of one kind, newest first."""
    out = []
    for r in rules:
        body = r.get("compiled")
        if isinstance(body, str):
            try:
                body = json.loads(body)                 # JSONB arrives as text
            except Exception:                           # noqa: BLE001
                continue
        if isinstance(body, dict) and body.get("kind") == kind and not body.get("error"):
            out.append(body)
    return out


def next_due_at(rules: list[dict], last_run: Optional[datetime],
                now: Optional[datetime] = None) -> tuple[datetime, str]:
    """
    When the next scheduled run is owed, and why.

    With no schedule rule this is the old six-hourly behaviour, so existing
    users are unaffected by the feature arriving. With several rules the
    earliest wins — someone who wrote both "every 2 hours" and "every morning at
    9" wants whichever comes first, not an argument about precedence.
    """
    now = now or datetime.now(timezone.utc)
    schedules = active_of_kind(rules, "schedule")

    if last_run is None:
        return now, "no scheduled run has happened yet"

    if not schedules:
        return last_run + timedelta(hours=DEFAULT_INTERVAL_HOURS), "every 6 hours (default)"

    best: Optional[datetime] = None
    why = ""
    for s in schedules:
        candidate = _next_for(s, last_run, now)
        if candidate and (best is None or candidate < best):
            best, why = candidate, s.get("description") or "a schedule rule"

    if best is None:
        return last_run + timedelta(hours=DEFAULT_INTERVAL_HOURS), "every 6 hours (default)"
    return best, why


def _next_for(s: dict, last_run: datetime, now: datetime) -> Optional[datetime]:
    """The next moment this one schedule rule permits a run."""
    days = s.get("days") or [0, 1, 2, 3, 4, 5, 6]

    if s.get("every_minutes"):
        candidate = last_run + timedelta(minutes=int(s["every_minutes"]))
        return _push_to_allowed_day(candidate, days, s.get("quiet_hours"))

    times = s.get("at_times") or []
    if not times:
        return None

    # Walk forward from the last run to the first allowed clock time after it.
    day = last_run.astimezone(timezone.utc)
    for offset in range(0, 9):                          # a week plus slack
        d = (day + timedelta(days=offset)).date()
        if ((d.weekday()) not in days):
            continue
        for hhmm in sorted(times):
            h, mi = (int(x) for x in hhmm.split(":"))
            candidate = datetime.combine(d, time(h, mi), tzinfo=timezone.utc)
            if candidate > last_run:
                return _push_to_allowed_day(candidate, days, s.get("quiet_hours"))
    return None


def _push_to_allowed_day(dt: datetime, days: list[int],
                         quiet: Optional[dict]) -> datetime:
    """Move a candidate forward past disallowed days and any quiet window."""
    for _ in range(8):
        if dt.weekday() not in days:
            dt = datetime.combine((dt + timedelta(days=1)).date(), time(0, 0),
                                  tzinfo=timezone.utc)
            continue
        if quiet and _in_quiet_hours(dt, quiet):
            to = quiet.get("to") or "07:00"
            h, mi = (int(x) for x in to.split(":"))
            nxt = datetime.combine(dt.date(), time(h, mi), tzinfo=timezone.utc)
            dt = nxt if nxt > dt else nxt + timedelta(days=1)
            continue
        return dt
    return dt


def _in_quiet_hours(dt: datetime, quiet: dict) -> bool:
    try:
        fh, fm = (int(x) for x in (quiet.get("from") or "22:00").split(":"))
        th, tm = (int(x) for x in (quiet.get("to") or "07:00").split(":"))
    except Exception:                                   # noqa: BLE001
        return False
    cur, start, end = dt.hour * 60 + dt.minute, fh * 60 + fm, th * 60 + tm
    return (start <= cur or cur < end) if start > end else (start <= cur < end)


def notify_plan(rules: list[dict], account_email: str,
                files_applied: int, escalations: int) -> dict:
    """
    Whether this run should send an email, and to where.

    Returns {"send": bool, "address": str, "reason": str}. The default is not to
    send: email is something a person asked for by writing a rule, and an agent
    that mails you without being asked is the thing this product is against.
    """
    plans = active_of_kind(rules, "notify")
    email_rules = [p for p in plans if p.get("channel") == "email"]

    if any(p.get("when") == "never" or p.get("channel") == "none" for p in plans):
        return {"send": False, "address": "", "reason": "a rule asks for no notifications"}

    if not email_rules:
        return {"send": False, "address": "", "reason": "no email rule"}

    for p in email_rules:
        when = p.get("when", "always")
        if when == "escalations_only" and not escalations:
            continue
        if when == "changes_only" and not files_applied:
            continue
        return {
            "send": True,
            "address": p.get("address") or account_email,
            "reason": p.get("description") or "an email rule asked for this",
        }

    return {"send": False, "address": "",
            "reason": "an email rule matched, but this run had nothing it wanted to report"}


def autonomy_overrides(rules: list[dict], prefs: dict) -> dict:
    """
    Preferences with any autonomy rule applied on top.

    A rule is a later, more specific statement of intent than a slider set once
    in Settings, so it wins. `always_ask` is expressed as a threshold above 1.0
    — nothing can ever clear it, so everything routes to the user, and the
    existing comparison in propose_changes needs no special case.
    """
    merged = dict(prefs or {})
    for a in active_of_kind(rules, "autonomy"):
        if a.get("always_ask"):
            merged["auto_threshold"] = 1.01
            merged["review_threshold"] = 1.01
            continue
        if a.get("auto_threshold") is not None:
            merged["auto_threshold"] = a["auto_threshold"]
        if a.get("review_threshold") is not None:
            merged["review_threshold"] = a["review_threshold"]
    return merged


def protected_patterns(rules: list[dict]) -> dict[str, list[str]]:
    """
    Paths, filename fragments and extensions the user has declared off-limits.

    These go to the **kernel**, not the approval hook. The hook decides whether
    to ask; the kernel decides what is physically permitted. A person who wrote
    "never touch my Projects folder" meant never — not "ask me first", and
    certainly not "ask me first, and proceed if the model phrases it well". A
    protect rule that only produced a prompt would be a protect rule in name.
    """
    paths: list[str] = []
    names: list[str] = []
    exts: list[str] = []
    for p in active_of_kind(rules, "protect"):
        paths += [str(x) for x in (p.get("paths") or []) if str(x).strip()]
        names += [str(x).lower() for x in (p.get("name_contains") or []) if str(x).strip()]
        exts += [str(x).lower() for x in (p.get("extensions") or []) if str(x).strip()]
    return {"paths": paths, "name_contains": names, "extensions": exts}


def blocklist_entries(rules: list[dict]) -> list[str]:
    """
    Protect rules as kernel blocklist entries.

    The kernel already takes a user blocklist and refuses any operation whose
    source or destination sits inside one. Feeding protect rules through that
    existing door means they inherit every guarantee it already has, rather than
    getting a second, weaker enforcement path of their own.
    """
    return [p for p in protected_patterns(rules)["paths"] if p]


def sensitivity_overrides(rules: list[dict]) -> dict[str, list[str]]:
    """
    What the user considers private, on top of the built-in detection.

    Two directions, and they are not symmetrical.

    Adding is safe: "treat my Contracts folder as private" can only ever route
    more files to a human, which is the direction this system errs in anyway.

    Removing is not. "Stop flagging receipts" makes the agent act on something
    it would otherwise have asked about, so it is deliberately narrow — it
    matches filename fragments the user named explicitly, and it can never
    switch off a whole detector. Someone who tires of being asked about one
    thing should not thereby lose the passport guarantee.
    """
    private_folders: list[str] = []
    private_names: list[str] = []
    private_exts: list[str] = []
    not_private: list[str] = []

    for s in active_of_kind(rules, "sensitivity"):
        add = s.get("treat_as_private") or {}
        private_folders += [str(x).lower() for x in (add.get("folders") or []) if str(x).strip()]
        private_names += [str(x).lower() for x in (add.get("name_contains") or []) if str(x).strip()]
        private_exts += [str(x).lower() for x in (add.get("extensions") or []) if str(x).strip()]

        drop = s.get("not_private") or {}
        not_private += [str(x).lower() for x in (drop.get("name_contains") or [])
                        if str(x).strip()]

    return {
        "private_folders": private_folders,
        "private_name_contains": private_names,
        "private_extensions": private_exts,
        "not_private_name_contains": not_private,
    }


def naming_policy(rules: list[dict]) -> dict:
    """
    How the user wants files named, merged across every naming rule.

    Returned as a plain dict for the agent to follow rather than applied here:
    renaming is a judgement about one specific filename, which is what the model
    is for. The kernel still refuses any rename that changes an extension.
    """
    policy: dict[str, Any] = {}
    strip: list[str] = []
    for n in active_of_kind(rules, "naming"):
        for key in ("date_first", "date_format", "separator", "keep_original", "scope_folder"):
            if n.get(key) not in (None, ""):
                policy[key] = n[key]
        strip += [str(x) for x in (n.get("strip") or []) if str(x).strip()]
    if strip:
        policy["strip"] = sorted(set(strip))
    return policy


def describe_for_agent(rules: list[dict]) -> list[dict]:
    """
    A flat list of what the user has asked for, for the `check_rules` tool.

    Includes the kind so the agent can say "I will email you when I'm done"
    rather than only knowing where to file things. Broken rules are included
    and flagged — the agent mentioning that a rule does not work is far better
    than everyone quietly ignoring it.
    """
    out = []
    for r in rules:
        body = r.get("compiled")
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except Exception:                           # noqa: BLE001
                body = None
        if isinstance(body, dict):
            out.append({
                "kind": body.get("kind", "filing"),
                "rule": body.get("description") or r.get("rule_text", ""),
                "broken": bool(body.get("error")),
                "problem": body.get("error", ""),
            })
        else:
            out.append({"kind": "filing", "rule": r.get("rule_text", ""),
                        "broken": False, "problem": ""})
    return out
