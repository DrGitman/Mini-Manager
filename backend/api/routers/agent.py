"""POST /agent — Groq LLM plans + emits typed operations, backend executes them for real."""

from __future__ import annotations

import asyncio
import json
import logging
import pathlib
import shutil
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from google.genai import types as genai_types
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services import gemini as gemini_svc
from .notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])

_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = settings.groq_model

# Groq rejects oversized requests with 413, and the exact ceiling isn't
# documented per-plan. Rather than guess it, start modest and retry smaller —
# the request always succeeds, it just carries less file detail.
_CONTEXT_BUDGETS = (12_000, 4_000, 0)
_MAX_FILES_PER_FOLDER = 200


class _PayloadTooLarge(Exception):
    """Groq refused the request as too large — retry with less context."""


# Strict schema. gpt-oss-120b supports constrained decoding, so the shape is
# guaranteed rather than merely requested — no more empty replies or a missing
# task on a clear command.
#
# `intent` is the important field: forcing the model to say which of chat /
# question / command it is, before producing anything, makes the distinction
# explicit instead of something we infer from whether `task` happens to be set.
_OPERATION_TYPES = [
    "move_files", "move_folder", "move_file", "copy_files",
    # "delete" = recoverable. Moves to the Archive.
    "delete_folder_recursive", "delete_file",
    # "permanently delete" = gone for good. Only ever emitted when the user
    # explicitly says permanently/forever/for good — kept as separate operation
    # types so an ordinary "delete these" can never reach them.
    "permanently_delete_file", "permanently_delete_folder",
    "create_folder", "rename", "organize_by_type",
    # "archive" = keep it, but move it out of the way into the Archive folder,
    # where the Archive page lists it and can restore it. Distinct from delete,
    # which goes to the Recycle Bin.
    "archive",
]

# Operations that destroy data irreversibly.
_IRREVERSIBLE = {"permanently_delete_file", "permanently_delete_folder"}

# Strict mode requires every property to be listed in `required`, so optional
# operation fields are declared nullable rather than omitted.
_AGENT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["chat", "question", "command"],
            "description": (
                "chat = greeting/thanks/small talk. "
                "question = asking about their files. "
                "command = telling you to change files or folders."
            ),
        },
        "reply": {"type": "string"},
        "needs_clarification": {"type": "boolean"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "type": {"type": "string"},
                },
                "required": ["question", "options", "type"],
                "additionalProperties": False,
            },
        },
        "task": {
            "type": ["object", "null"],
            "properties": {
                "description": {"type": "string"},
                "operations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": _OPERATION_TYPES},
                            "source": {"type": ["string", "null"]},
                            "destination": {"type": ["string", "null"]},
                            "path": {"type": ["string", "null"]},
                            "new_name": {"type": ["string", "null"]},
                        },
                        "required": ["type", "source", "destination", "path", "new_name"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["description", "operations"],
            "additionalProperties": False,
        },
    },
    "required": ["intent", "reply", "needs_clarification", "questions", "task"],
    "additionalProperties": False,
}

# ─── Prompts ──────────────────────────────────────────────────────────────────

_AGENT_SYSTEM = r"""You are Mini Manager, an AI file management assistant that ACTUALLY EXECUTES operations on the user's local file system.

When the user gives you a file/folder command, you output a JSON response with typed operations that the backend will execute immediately and for real.

OPERATION TYPES (use exact paths the user gave — never invent paths):
- {"type": "move_files", "source": "C:\\path\\from", "destination": "C:\\path\\to"}
  → moves every FILE inside source into destination folder
- {"type": "move_folder", "source": "C:\\path\\folder", "destination": "C:\\path\\new_parent"}
  → moves entire folder (with all contents) into destination parent
- {"type": "move_file", "source": "C:\\path\\file.txt", "destination": "C:\\path\\to\\file.txt"}
  → moves a single file
- {"type": "copy_files", "source": "C:\\path\\from", "destination": "C:\\path\\to"}
  → copies every file from source into destination
- {"type": "delete_file", "path": "C:\\path\\file.txt"}
  → sends ONE file to the Recycle Bin. Recoverable. Use for any ordinary
    "delete", "remove", "get rid of", "bin it", "throw away".
- {"type": "delete_folder_recursive", "path": "C:\\path\\folder"}
  → sends a folder and its contents to the Recycle Bin. Recoverable.

- {"type": "archive", "path": "C:\\path\\file-or-folder"}
  → moves it into the user's Archive folder, where the Archive page lists it
    and it can be restored. This is NOT deleting — the file is being KEPT,
    just moved out of the way.
    Use whenever the user says "archive", "put it away", "store it", "move it
    out of the way", or "I don't need it now but don't delete it".
    Deleting and archiving go to different places. NEVER answer "archive this"
    with a delete operation.

- {"type": "permanently_delete_file", "path": "C:\\path\\file.txt"}
- {"type": "permanently_delete_folder", "path": "C:\\path\\folder"}
  → GONE FOREVER. No undo, no Archive, no recovery.
    ONLY use these when the user explicitly says "permanently", "forever",
    "for good", "completely", "wipe", or "don't archive it".
    "delete this" on its own NEVER means permanent — use delete_file.
    If in doubt, use the recoverable version and say so in your reply.
- {"type": "create_folder", "path": "C:\\path\\new_folder"}
  → creates a new folder (including parents)
- {"type": "rename", "path": "C:\\path\\old_name", "new_name": "new_name"}
  → renames a file or folder in place
- {"type": "organize_by_type", "source": "C:\\path\\folder"}
  → groups files in source into subfolders by extension (Images, Documents, Videos, etc.)

CLARIFICATION RULES — only ask when you are genuinely blocked:
- The user gave you a full path → EXECUTE, never ask.
- The user said "this folder" and you can see the path in context → EXECUTE.
- The user said "organise my Downloads" → EXECUTE (use C:\Users\<name>\Downloads or the path in context).
- Only set needs_clarification: true when a REQUIRED piece of information is completely missing AND you cannot reasonably infer it. For example: "rename my files" with no folder path and no pattern given.
- When you do ask, ask at most 2 focused questions, each with 2–4 short option labels. Never ask questions that the user already answered.

EXECUTION RULES:
- Always emit operations in logical order (move contents BEFORE deleting the folder they came from).
- Use EXACT paths from the user's message. Never invent or modify paths.
- "delete folder and move its contents back to X" = move_files(source=folder, dest=X) then delete_folder_recursive(folder).

RESPONSE FORMAT (strict JSON):

When executing:
{
  "reply": "Brief friendly confirmation of what you did / are doing",
  "needs_clarification": false,
  "questions": [],
  "task": {
    "description": "one-line summary",
    "operations": [
      {"type": "move_files", "source": "C:\\exact\\source", "destination": "C:\\exact\\dest"},
      {"type": "delete_folder_recursive", "path": "C:\\exact\\folder"}
    ]
  }
}

When genuinely blocked (needs_clarification: true):
{
  "reply": "Just one quick thing before I start.",
  "needs_clarification": true,
  "questions": [
    {"question": "Short focused question?", "options": ["Option A", "Option B", "Option C"], "type": "single_select"}
  ],
  "task": null
}

When no action needed (e.g. answering a question about files):
{
  "reply": "Answer here — use the FILE CONTEXT provided to answer accurately",
  "needs_clarification": false,
  "questions": [],
  "task": null
}

FIRST, CLASSIFY THE USER'S MESSAGE — set "intent" to exactly one of:

  "chat"     — greeting, thanks, goodbye, small talk, or asking what you can do.
               → short friendly reply, "task": null
  "question" — asking ABOUT their files ("which are school files?", "how many
               PDFs?", "what's in Downloads?").
               → answer from FILE CONTEXT, "task": null. Answering is not acting.
  "command"  — telling you to CHANGE something: organise, sort, move, copy,
               delete, rename, create, clean up, group, archive.
               → "task" MUST contain the operations. Never null for a command.

Set "intent" before deciding anything else. If intent is "command" you must
produce a task; if it is "chat" or "question" you must not.

CONVERSATION RULES (check these FIRST, before anything else):
- If the user is greeting you ("hi", "hello", "hey"), thanking you, saying goodbye, or making
  small talk, reply in ONE short friendly sentence with "task": null. Do NOT list files.
  A greeting is not a request to do anything.
- If the user asks what you can do, describe your abilities briefly with "task": null.
- If the user ASKS ABOUT their files ("which are school files?", "how many PDFs?"), answer
  from FILE CONTEXT with "task": null. Answering is not acting.
- If the user TELLS YOU TO DO something (organise, sort, move, copy, delete, rename, create,
  clean up, group, archive), you MUST return a "task" with operations. Replying with
  "task": null to a command is wrong — the user asked for work and nothing would happen.
  Example: "organise C:\Users\me\Documents by file type"
    → task.operations = [{"type": "organize_by_type", "source": "C:\\Users\\me\\Documents"}]
- The FILE CONTEXT is attached to every message automatically. Its presence is NOT a request.

"reply" must never be empty. Always say something to the user.

WHAT YOU CAN AND CANNOT SEE — this matters more than anything else here.

You may ONLY state facts present in the FILE CONTEXT. For each file you are given
its filename, extension, size, last-modified date, and full path. Nothing else.

COMPLETE FIGURES vs SAMPLES — get this wrong and you will state a wrong number
about files the user can see for themselves, which destroys their trust instantly.
- Anything the context labels COMPLETE — totals, per-type counts, folder counts —
  is exact for every file. Use these, and ONLY these, to answer "how many" or
  "how much space".
- Anything labelled SAMPLE is a short excerpt. NEVER count a sample to answer a
  total. "Largest 15" tells you what the biggest files are, not how many exist.
- If a listing says it was truncated, the complete figures are still exact, but
  say your list of NAMES is partial.

You CAN answer, from that data:
- How many files / of a given type / what types are present — from the complete counts
- Total or individual sizes, biggest files, space used by a category
- Anything about NAMES: contains "invoice", starts with IMG_, has "(1)", no extension
- Which folder something is in
- Dates from the last-modified date: what changed recently, what is old, what has
  been sitting untouched. Say "last changed on", not "downloaded on" — the date is
  when the file was last modified, which is not always when it arrived.

You CANNOT answer these, because the data is not there:
- What is INSIDE any file. You have the filename, not the contents.
- When something was originally created or downloaded, as opposed to modified
- Whether a file is "final", "important", "still needed", or "already sent"
- What is inside a zip, or whether anything is a virus
- Anything about other people, other devices, or email

This context belongs to ONE user. Never mention files, folders or habits from
anyone else, and never generalise — no "most people", no "users typically".
Answer only from this person's own data.

If there is no FILE CONTEXT at all, say you haven't scanned anything yet and offer
to scan. Never describe a folder you have not been given.

NEVER infer contents from a filename. "contract_final_v3.pdf" tells you someone
named a file that. It does not tell you what the contract says, or that it is final.

When asked something you cannot answer, say what you DO know and what it would
take to answer properly. For example:
  "I can see contract_final_v3.pdf — 2.1 MB, in Documents. I haven't read it,
   so I can't tell you what's in it. Open it in the app and I'll explain it."
  "I can see when files were last changed, but not when you first downloaded
   them. Going by last-changed, three files in Downloads were touched this week."

A precise "I can see X but not Y" is always better than a confident guess. Guessing
about someone's own files destroys their trust in everything else you say.

If your file list was truncated (it will say so), say your count is for the files
you can see and may not be the whole folder. Do not present a partial count as
complete.

FILE CONTEXT RULES:
- If a FILE CONTEXT block is present, use it to answer questions about what files exist.
- When asked to filter or find files by TOPIC (e.g. "school files", "work files", "photos from last year"):
  → Use semantic reasoning on file names to decide relevance. DO NOT list every file.
  → "school files": look for keywords like Assessment, Assignment, Exam, Quiz, Course, Lecture, Study, Research, Thesis, Essay, Report (academic), University, College, Module, Grade, Submission, Academic paper names (author_title.pdf), textbook names
  → "work files": invoices, contracts, proposals, reports, presentations, meeting notes
  → "photos": image extensions (.jpg, .png, .heic, .raw), camera roll names (IMG_, DSC_, DCIM)
  → Exclude files that clearly belong to other categories (e.g. HabitFlow, app downloads, installers)
  → List ONLY the files that match the requested topic, not all files
  → If unsure about a file, err on the side of inclusion but note it may not match
- For file operation commands (move, delete, rename): use the exact paths from FILE CONTEXT
- Never say you cannot search files if a FILE CONTEXT is provided — use it to answer directly."""


_GROQ_STEPS_SYSTEM = """\
You receive a file management task description and a list of operations that were executed.
Write 3-6 concise, past-tense step labels describing what happened. Be specific (mention folder names, file counts if known).
Return ONLY: {"steps": [{"label": "...", "status": "done"}, ...]}"""


# ─── Filesystem execution ─────────────────────────────────────────────────────

EXT_GROUPS: dict[str, list[str]] = {
    "Images":     [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".heic", ".tiff", ".raw"],
    "Videos":     [".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v"],
    "Audio":      [".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma"],
    "Documents":  [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".txt", ".rtf"],
    "Code":       [".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".json", ".yaml", ".yml", ".sh", ".bat", ".ps1", ".java", ".cpp", ".c", ".h", ".go", ".rs"],
    "Archives":   [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"],
    "Executables":[".exe", ".msi", ".dmg", ".pkg", ".deb", ".AppImage"],
}

# ─── Safety ───────────────────────────────────────────────────────────────────

# Paths the agent must never touch, however confidently it is asked. Matched
# case-insensitively against the whole path.
_PROTECTED_FRAGMENTS = (
    "c:\\windows", "c:\\program files", "c:\\programdata",
    "\\appdata\\", "\\system32", "\\$recycle.bin",
    "node_modules", "\\.git\\", "\\venv\\", "\\.venv\\",
)


def _is_protected(path: pathlib.Path) -> bool:
    p = str(path).lower().replace("/", "\\")
    if any(frag in p for frag in _PROTECTED_FRAGMENTS):
        return True
    # A bare drive root — "organise C:\" would otherwise walk the whole disk.
    return len(path.parts) <= 1


def _quarantine_dir(original: pathlib.Path) -> pathlib.Path:
    """
    Where 'deleted' things actually go. Kept beside the original so it stays on
    the same drive — a cross-drive move is a copy+delete, which is exactly what
    we're avoiding.
    """
    root = original.parent / "_Mini Manager Archive"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_archive(p: pathlib.Path) -> str:
    """Move to the archive instead of deleting. Never overwrites."""
    dest_dir = _quarantine_dir(p)
    dest = dest_dir / p.name
    n = 1
    while dest.exists():
        dest = dest_dir / f"{p.stem} ({n}){p.suffix}"
        n += 1
    shutil.move(str(p), str(dest))
    return str(dest)


def _ext_group(ext: str) -> str:
    ext = ext.lower()
    for group, exts in EXT_GROUPS.items():
        if ext in exts:
            return group
    return "Other"

def _safe_dest(dst: pathlib.Path) -> pathlib.Path:
    """Avoid overwriting: append (1), (2) … until unique."""
    if not dst.exists():
        return dst
    stem, suffix = dst.stem, dst.suffix
    i = 1
    while True:
        candidate = dst.parent / f"{stem} ({i}){suffix}"
        if not candidate.exists():
            return candidate
        i += 1

def _execute_operations(operations: list[dict]) -> list[dict]:
    results: list[dict] = []

    for op in operations:
        t = op.get("type", "")
        logger.info("Executing operation: %s", op)

        # Refuse protected paths before doing anything. The model can be talked
        # into "organise C:\Windows"; this is what stops it mattering.
        targets = [op.get(k) for k in ("source", "destination", "path") if op.get(k)]
        blocked = next(
            (p for p in targets if _is_protected(pathlib.Path(p))), None
        )
        if blocked:
            logger.warning("Refused operation %s on protected path: %s", t, blocked)
            results.append({
                "op": t, "status": "refused",
                "detail": (
                    f"I won't touch {blocked} — it's a system or development folder. "
                    "Point me at a personal folder like Downloads or Documents instead."
                ),
            })
            continue

        try:
            # ── move_files ────────────────────────────────────────────────────
            if t == "move_files":
                src = pathlib.Path(op["source"])
                dst = pathlib.Path(op["destination"])
                if not src.exists():
                    results.append({"op": t, "status": "failed", "detail": f"Source folder not found: {src}"})
                    continue
                dst.mkdir(parents=True, exist_ok=True)
                files = [f for f in src.iterdir() if f.is_file()]
                moved = 0
                for f in files:
                    target = _safe_dest(dst / f.name)
                    shutil.move(str(f), str(target))
                    moved += 1
                results.append({"op": t, "status": "done", "detail": f"Moved {moved} file(s) from {src.name} → {dst.name}"})

            # ── move_folder ───────────────────────────────────────────────────
            elif t == "move_folder":
                src = pathlib.Path(op["source"])
                dst_parent = pathlib.Path(op["destination"])
                if not src.exists():
                    results.append({"op": t, "status": "failed", "detail": f"Folder not found: {src}"})
                    continue
                dst_parent.mkdir(parents=True, exist_ok=True)
                target = _safe_dest(dst_parent / src.name)
                shutil.move(str(src), str(target))
                results.append({"op": t, "status": "done", "detail": f"Moved folder {src.name} → {dst_parent.name}"})

            # ── move_file ─────────────────────────────────────────────────────
            elif t == "move_file":
                src = pathlib.Path(op["source"])
                dst = pathlib.Path(op["destination"])
                if not src.exists():
                    results.append({"op": t, "status": "failed", "detail": f"File not found: {src}"})
                    continue
                dst.parent.mkdir(parents=True, exist_ok=True)
                target = _safe_dest(dst)
                shutil.move(str(src), str(target))
                results.append({"op": t, "status": "done", "detail": f"Moved {src.name} → {target.parent.name}"})

            # ── copy_files ────────────────────────────────────────────────────
            elif t == "copy_files":
                src = pathlib.Path(op["source"])
                dst = pathlib.Path(op["destination"])
                if not src.exists():
                    results.append({"op": t, "status": "failed", "detail": f"Source not found: {src}"})
                    continue
                dst.mkdir(parents=True, exist_ok=True)
                files = [f for f in src.iterdir() if f.is_file()]
                copied = 0
                for f in files:
                    target = _safe_dest(dst / f.name)
                    shutil.copy2(str(f), str(target))
                    copied += 1
                results.append({"op": t, "status": "done", "detail": f"Copied {copied} file(s) to {dst.name}"})

            # ── delete_folder_recursive → archive, never delete ───────────────
            # The product promise is that nothing is ever destroyed. These used
            # to call shutil.rmtree / unlink, which made "clean up my Downloads"
            # capable of irreversible data loss.
            elif t == "delete_folder_recursive":
                p = pathlib.Path(op["path"])
                if not p.exists():
                    results.append({"op": t, "status": "done", "detail": f"{p.name} already gone"})
                    continue
                count = sum(1 for _ in p.rglob("*"))
                dest = _safe_archive(p)
                results.append({
                    "op": t, "status": "done",
                    "detail": f"Moved {p.name} ({count} items) to the Archive — restore it any time",
                    "archived_to": dest,
                })

            # ── delete_file → archive, never delete ───────────────────────────
            elif t == "delete_file":
                p = pathlib.Path(op["path"])
                if not p.exists():
                    results.append({"op": t, "status": "done", "detail": f"{p.name} already gone"})
                    continue
                dest = _safe_archive(p)
                results.append({
                    "op": t, "status": "done",
                    "detail": f"Moved {p.name} to the Archive — restore it any time",
                    "archived_to": dest,
                })

            # ── permanently_delete_file → really gone ─────────────────────────
            # Only reached when the user explicitly asked for permanent removal.
            elif t == "permanently_delete_file":
                p = pathlib.Path(op["path"])
                if not p.exists():
                    results.append({"op": t, "status": "done", "detail": f"{p.name} already gone"})
                    continue
                p.unlink()
                logger.warning("PERMANENTLY deleted file: %s", p)
                results.append({
                    "op": t, "status": "done",
                    "detail": f"Permanently deleted {p.name}. This cannot be undone.",
                })

            # ── permanently_delete_folder → really gone ───────────────────────
            elif t == "permanently_delete_folder":
                p = pathlib.Path(op["path"])
                if not p.exists():
                    results.append({"op": t, "status": "done", "detail": f"{p.name} already gone"})
                    continue
                count = sum(1 for _ in p.rglob("*"))
                shutil.rmtree(str(p))
                logger.warning("PERMANENTLY deleted folder: %s (%d items)", p, count)
                results.append({
                    "op": t, "status": "done",
                    "detail": f"Permanently deleted {p.name} ({count} items). This cannot be undone.",
                })

            # ── create_folder ─────────────────────────────────────────────────
            elif t == "create_folder":
                p = pathlib.Path(op["path"])
                p.mkdir(parents=True, exist_ok=True)
                results.append({"op": t, "status": "done", "detail": f"Created {p.name}"})

            # ── rename ────────────────────────────────────────────────────────
            elif t == "rename":
                p = pathlib.Path(op["path"])
                new_name = op.get("new_name", "")
                if not p.exists():
                    results.append({"op": t, "status": "failed", "detail": f"Not found: {p}"})
                    continue
                new_path = p.parent / new_name
                p.rename(new_path)
                results.append({"op": t, "status": "done", "detail": f"Renamed {p.name} → {new_name}"})

            # ── organize_by_type ──────────────────────────────────────────────
            elif t == "organize_by_type":
                src = pathlib.Path(op["source"])
                if not src.exists():
                    results.append({"op": t, "status": "failed", "detail": f"Folder not found: {src}"})
                    continue
                counters: dict[str, int] = {}
                for f in list(src.iterdir()):
                    if not f.is_file():
                        continue
                    group = _ext_group(f.suffix)
                    dest_dir = src / group
                    dest_dir.mkdir(exist_ok=True)
                    target = _safe_dest(dest_dir / f.name)
                    shutil.move(str(f), str(target))
                    counters[group] = counters.get(group, 0) + 1
                summary = ", ".join(f"{v} {k}" for k, v in counters.items()) or "no files"
                results.append({"op": t, "status": "done", "detail": f"Organised {src.name}: {summary}"})

            else:
                results.append({"op": t, "status": "skipped", "detail": f"Unknown operation type '{t}'"})

        except Exception as exc:
            logger.error("Operation %s failed: %s", t, exc, exc_info=True)
            results.append({"op": t, "status": "failed", "detail": str(exc)})

    return results


# ─── LLM helpers ──────────────────────────────────────────────────────────────

async def _call_groq(
    messages: list[dict],
    temperature: float = 0.2,
    schema: Optional[dict] = None,
) -> dict:
    """
    Call Groq. When `schema` is given, use constrained decoding so the reply is
    guaranteed to match it — that is what makes the chat/command distinction
    reliable instead of dependent on how the prompt is worded.
    """
    if schema is not None:
        response_format = {
            "type": "json_schema",
            "json_schema": {"name": "agent_response", "strict": True, "schema": schema},
        }
    else:
        response_format = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            _GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
            json={"model": _GROQ_MODEL, "messages": messages, "temperature": temperature, "response_format": response_format},
        )

        # Distinct type so the caller can retry with a smaller context instead
        # of failing the user's request.
        if resp.status_code == 413:
            raise _PayloadTooLarge()
        if resp.status_code == 429:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "The AI service is rate limited right now. Please try again shortly.",
            )
        if resp.status_code >= 400:
            logger.error("Groq error %s: %s", resp.status_code, resp.text[:400])
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "The AI service is unavailable right now. Please try again.",
            )

        return json.loads(resp.json()["choices"][0]["message"]["content"])


# Gemini uses a different schema dialect to Groq: `nullable: true` rather than
# `type: ["object", "null"]`. Same shape, expressed the way each provider wants.
_AGENT_SCHEMA_GEMINI = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["chat", "question", "command"]},
        "reply": {"type": "string"},
        "needs_clarification": {"type": "boolean"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "type": {"type": "string"},
                },
                "required": ["question"],
            },
        },
        "task": {
            "type": "object",
            "nullable": True,
            "properties": {
                "description": {"type": "string"},
                "operations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": _OPERATION_TYPES},
                            "source": {"type": "string", "nullable": True},
                            "destination": {"type": "string", "nullable": True},
                            "path": {"type": "string", "nullable": True},
                            "new_name": {"type": "string", "nullable": True},
                        },
                        "required": ["type"],
                    },
                },
            },
            "required": ["description", "operations"],
        },
    },
    "required": ["intent", "reply", "needs_clarification", "questions"],
}


async def _call_gemini_agent(messages: list[dict]) -> dict:
    """
    Same job as _call_groq, on Gemini.

    Gemini takes the system prompt separately rather than as a message, so the
    system entries are pulled out and the conversation is passed as contents.
    """
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    convo = [m for m in messages if m["role"] != "system"]
    transcript = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in convo
    )

    client = gemini_svc._get_gemini()
    response = await asyncio.to_thread(
        lambda: client.models.generate_content(
            model=settings.gemini_model,
            contents=transcript or "Hello",
            config=genai_types.GenerateContentConfig(
                system_instruction="\n\n".join(system_parts),
                response_mime_type="application/json",
                response_schema=_AGENT_SCHEMA_GEMINI,
            ),
        )
    )
    return json.loads((response.text or "{}").strip())


async def _call_agent_llm(messages: list[dict]) -> dict:
    """
    Gemini first, Groq as fallback.

    Groq's free tier caps requests per minute, and every chat message costs one —
    which is why a second message moments after the first came back 429. Gemini
    carries the main path; Groq is now only resilience.
    """
    try:
        return await _call_gemini_agent(messages)
    except _PayloadTooLarge:
        raise
    except Exception as exc:
        logger.warning("Gemini agent call failed (%s) — falling back to Groq", exc)
        return await _call_groq(messages, schema=_AGENT_RESPONSE_SCHEMA)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AgentMessage(BaseModel):
    role: str
    content: str

class AgentRequest(BaseModel):
    messages: list[AgentMessage]
    folder_context: Optional[str] = None
    file_listing: Optional[list[dict]] = None  # [{folder, files: [{name, ext, size_kb, path}]}]
    # The desktop app's digest of every watched folder: complete counts plus
    # small samples. Preferred over file_listing, which had no totals and made
    # the model count the sample it was handed instead of the folder.
    scan_context: Optional[dict] = None
    # Set on the follow-up turn after a scan actually ran, so the reply can be
    # "you have 200 images" rather than a bare "done".
    task_result: Optional[dict] = None
    # The desktop app sets this. The user's files live on their machine, so a
    # hosted backend cannot act on them — it plans, and the client executes.
    # Defaults to False so a locally-run backend keeps working as before.
    client_execution: bool = False

class AgentStep(BaseModel):
    label: str
    status: str = "done"  # pending | active | done | failed | skipped
    detail: Optional[str] = None

class AgentQuestion(BaseModel):
    question: str
    options: list[str] = []
    type: str = "single_select"

class AgentResponse(BaseModel):
    reply: str
    needs_clarification: bool = False
    questions: list[AgentQuestion] = []
    steps: list[AgentStep] = []
    # Populated only when client_execution is set: the plan for the desktop app
    # to run locally. Empty when the backend executed the operations itself.
    operations: list[dict] = []


# ─── File context ─────────────────────────────────────────────────────────────

def _fmt_size(b: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024 or unit == "GB":
            return f"{b:.0f}{unit}" if unit == "B" else f"{b:.1f}{unit}"
        b /= 1024.0
    return f"{b:.1f}GB"


def _build_scan_context(ctx: dict, budget: int) -> str:
    """
    Render the desktop app's folder digest.

    Complete figures and partial samples are labelled separately and loudly.
    A model handed a 15-row "largest files" sample will otherwise answer "how
    many images do I have" by counting that sample — a wrong number, stated
    confidently, about files the user can see for themselves.
    """
    folders = ctx.get("watched_folders") or []
    totals = ctx.get("totals") or {}
    unreadable = ctx.get("unreadable_folders") or []

    if not folders and not unreadable:
        return (
            "FILE CONTEXT: no folders are being watched yet. Say so and offer to "
            "add one in Settings, or to scan a folder now. Do NOT invent a folder "
            "or describe files you have not been given."
        )

    lines = [
        "FILE CONTEXT — the user's watched folders, scanned on their machine.",
        "",
        "COMPLETE FIGURES (true for every file, use these for any total):",
        f"  Files in total: {totals.get('total_files', 0)}",
        f"  Size in total: {_fmt_size(totals.get('total_bytes', 0))}",
        f"  Folders watched: {totals.get('folder_count', 0)}",
        f"  Unchanged in over a year: {totals.get('stale_count', 0)}",
    ]

    by_ext = totals.get("by_extension") or {}
    if by_ext:
        ranked = sorted(by_ext.items(), key=lambda kv: -kv[1].get("count", 0))
        lines.append("  Every file type across all folders (complete counts):")
        for ext, v in ranked[:40]:
            lines.append(f"    .{ext}: {v.get('count', 0)} files, {_fmt_size(v.get('bytes', 0))}")

    for f in folders:
        lines.append("")
        lines.append(f"📁 {f.get('label')} — {f.get('root')}")
        lines.append(
            f"  COMPLETE: {f.get('total_files', 0)} files, "
            f"{_fmt_size(f.get('total_bytes', 0))}, "
            f"{f.get('stale_count', 0)} unchanged in over a year, "
            f"{f.get('empty_count', 0)} empty"
        )
        fext = f.get("by_extension") or {}
        if fext:
            ranked = sorted(fext.items(), key=lambda kv: -kv[1].get("count", 0))
            inline = ", ".join(f".{e} × {v.get('count', 0)}" for e, v in ranked[:15])
            lines.append(f"  Types (complete): {inline}")

        if f.get("all_files"):
            lines.append(f"  Every file in this folder ({len(f['all_files'])} of {f.get('total_files', 0)}):")
            for x in f["all_files"]:
                lines.append(f"    {x.get('n')} | {_fmt_size(x.get('s', 0))} | {x.get('m') or 'no date'}")
        else:
            lines.append(
                f"  This folder has {f.get('total_files', 0)} files — too many to list. "
                "The samples below are PARTIAL. Never count them."
            )
            for key, title in (("sample_largest", "Largest"), ("sample_newest", "Newest"), ("sample_oldest", "Oldest")):
                rows = f.get(key) or []
                if rows:
                    lines.append(f"  {title} (SAMPLE, not a total):")
                    for x in rows:
                        lines.append(f"    {x.get('n')} | {_fmt_size(x.get('s', 0))} | {x.get('m') or 'no date'}")

    for u in unreadable:
        lines.append(f"\n⚠ Could not read {u.get('root')}: {u.get('error')}")
        lines.append("  If the question covers this folder, say you couldn't read it and why.")

    if ctx.get("any_stale"):
        lines.append(
            f"\nThese scans are from {ctx.get('oldest_scan')} and may be out of date. "
            "You may still answer, but mention when it was scanned and offer to rescan."
        )

    out = "\n".join(lines)
    if budget > 0 and len(out) > budget:
        # Trim file rows from the end; the complete figures at the top survive,
        # so totals stay correct even in a heavily truncated context.
        out = out[:budget] + (
            "\n  ... listing truncated. The COMPLETE FIGURES above are still exact — "
            "use them for counts. Say your list of names is partial."
        )
    return out


def _build_file_context(file_listing: list[dict], budget: int) -> str:
    """
    Render the file listing within a character budget.

    A per-folder cap alone isn't enough — many folders, or long Windows paths,
    still produce a request Groq refuses. Budgeting the whole block keeps the
    request inside the limit whatever the folder looks like.
    """
    if budget <= 0 or not file_listing:
        total = sum(len(f.get("files", [])) for f in file_listing)
        return (
            f"FILE CONTEXT: the user has {total} files in scope, too many to list here. "
            "Answer general questions normally. If they ask about specific files, ask "
            "them which folder to look in."
        )

    lines = [
        "FILE CONTEXT (real files from the user's scan scope folders):",
        "Use this to answer questions about files, filter by topic, or build operations.",
        "Format: filename | extension | size | full_path",
        # Older desktop builds send this shape, which carries no dates and no
        # folder totals. Say so rather than answering from the general rules,
        # which assume the newer digest.
        "NOTE: this listing has NO dates and NO complete totals — it is a partial "
        "list. You cannot answer questions about when files changed, and any count "
        "you give is 'at least N, from what I can see'. Suggest they update the app "
        "for exact counts.",
    ]
    remaining = budget
    omitted = 0

    for folder_entry in file_listing:
        folder_name = folder_entry.get("folder", "Unknown")
        files = folder_entry.get("files", [])
        header = f"\n📁 {folder_name} — {len(files)} files:"
        if remaining - len(header) <= 0:
            omitted += len(files)
            continue
        lines.append(header)
        remaining -= len(header)

        shown = 0
        for f in files[:_MAX_FILES_PER_FOLDER]:
            size_str = f"{f.get('size_kb', 0):.0f}KB"
            line = f"  {f['name']} | {f.get('ext', '')} | {size_str} | {f.get('path', f['name'])}"
            if remaining - len(line) <= 0:
                break
            lines.append(line)
            remaining -= len(line)
            shown += 1

        omitted += len(files) - shown

    if omitted:
        lines.append(f"\n  ... {omitted} more files not listed (context limit reached)")
        lines.append(
            "  If the user asks about files beyond this list, ask them which folder to "
            "look in rather than guessing."
        )
    return "\n".join(lines)


# ─── Route ────────────────────────────────────────────────────────────────────

@router.post("/agent", response_model=AgentResponse)
async def agent_chat(
    body: AgentRequest,
    user: dict = Depends(get_current_user),
) -> AgentResponse:
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    # Build context block from file listing
    context_parts: list[str] = []
    if body.folder_context:
        context_parts.append(f"Current folder: {body.folder_context}")

    if body.file_listing:
        pass  # file context is built per-attempt below, so it can shrink on retry

    def build_messages(budget: int) -> list[dict]:
        """
        Keep the file listing OUT of the user's own message. Gluing it on made a
        bare "Hello" arrive as hundreds of lines of filenames followed by one
        word, and the model answered the listing instead of the greeting.
        """
        parts = list(context_parts)
        # The digest carries complete counts, so it wins when both are present.
        if body.scan_context:
            parts.append(_build_scan_context(body.scan_context, budget))
        elif body.file_listing:
            parts.append(_build_file_context(body.file_listing, budget))

        if body.task_result:
            steps = "; ".join(body.task_result.get("steps") or [])
            parts.append(
                "JUST COMPLETED: "
                f"{body.task_result.get('summary', 'a scan')}"
                + (f" ({steps})" if steps else "")
                + ". The file context above is the fresh result. Answer the user's "
                "original question now, with real numbers — do not just say it is done."
            )

        msgs: list[dict] = [{"role": "system", "content": _AGENT_SYSTEM}]
        if parts:
            msgs.append({
                "role": "system",
                "content": (
                    "Background information about the user's files. This is attached to "
                    "every message automatically — it is not a request. Only use it if "
                    "the user's actual message asks about files.\n\n" + "\n\n".join(parts)
                ),
            })
        msgs.extend(messages)
        return msgs

    steps: list[AgentStep] = []

    # ── Phase 1: Groq understands + emits typed operations ────────────────────
    # Retry with progressively less file detail rather than failing the user.
    # The last budget is 0, which always fits — so this cannot end in an error
    # just because someone has a large Downloads folder.
    groq_data = None
    for attempt, budget in enumerate(_CONTEXT_BUDGETS):
        try:
            groq_data = await _call_agent_llm(build_messages(budget))
            break
        except _PayloadTooLarge:
            logger.warning(
                "Groq 413 with context budget %d; retrying smaller (attempt %d)",
                budget, attempt + 1,
            )
    if groq_data is None:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The AI service could not process that request. Please try again.",
        )

    reply = groq_data.get("reply", "")
    needs_clarification = bool(groq_data.get("needs_clarification", False))
    raw_questions = groq_data.get("questions", [])
    task = groq_data.get("task")
    intent = groq_data.get("intent", "?")
    logger.info("AGENT_INTENT=%s task_present=%s reply=%s", intent, task is not None, reply[:80])

    # The schema guarantees the shape, not the semantics: it still permits
    # intent="command" with task=null. Catch that contradiction and retry once
    # with an explicit correction rather than silently doing nothing.
    if intent == "command" and task is None:
        logger.warning("Agent said 'command' but emitted no task — retrying with correction")
        retry_messages = build_messages(_CONTEXT_BUDGETS[0]) + [
            {"role": "assistant", "content": json.dumps(groq_data)},
            {
                "role": "user",
                "content": (
                    "You classified that as a command but returned no task. "
                    "Return the same JSON again with task.operations filled in "
                    "using the exact paths from my message."
                ),
            },
        ]
        try:
            retried = await _call_agent_llm(retry_messages)
            if retried.get("task"):
                groq_data = retried
                task = retried["task"]
                reply = retried.get("reply", reply)
                logger.info("Retry produced a task: %s", json.dumps(task)[:200])
        except Exception as exc:
            logger.warning("Command retry failed: %s", exc)

    logger.info("Groq task: %s", json.dumps(task))

    # Coerce questions
    questions: list[AgentQuestion] = []
    for q in raw_questions:
        if isinstance(q, dict):
            questions.append(AgentQuestion(
                question=q.get("question", str(q)),
                options=q.get("options", []),
                type=q.get("type", "single_select"),
            ))
        elif isinstance(q, str):
            questions.append(AgentQuestion(question=q, options=[], type="single_select"))

    # ── Phase 2: Execute operations ───────────────────────────────────────────
    planned_operations: list[dict] = []

    if task and not needs_clarification:
        operations: list[dict] = task.get("operations", [])
        logger.info("Operations to execute: %s", json.dumps(operations))

        # The desktop app runs these itself. The user's files are on their
        # machine, so a hosted backend has nothing to act on — it plans, the
        # client executes, and the files never leave the device.
        if operations and body.client_execution:
            planned_operations = operations
            logger.info("Returning %d operation(s) for the client to run", len(operations))
            steps = [
                AgentStep(label=task.get("description", "Applying changes"), status="pending")
            ]
            return AgentResponse(
                reply=reply,
                needs_clarification=False,
                questions=questions,
                steps=steps,
                operations=planned_operations,
            )

        if operations:
            exec_results = _execute_operations(operations)
            logger.info("Execution results: %s", json.dumps(exec_results))

            # Fire a notification for completed agent operations
            done_ops = [r for r in exec_results if r["status"] == "done"]
            failed_ops = [r for r in exec_results if r["status"] == "failed"]
            if done_ops or failed_ops:
                task_desc = task.get("description", "File operation")
                if failed_ops:
                    body_text = f"{task_desc} — {len(done_ops)} succeeded, {len(failed_ops)} failed."
                    notif_kind = "system"
                else:
                    body_text = f"{task_desc} — {len(done_ops)} operation{'s' if len(done_ops) != 1 else ''} completed."
                    notif_kind = "agent"
                await create_notification(
                    user_id=user["sub"],
                    kind=notif_kind,
                    title="Agent task complete" if not failed_ops else "Agent task partially failed",
                    body=body_text,
                )

            # Generate human-readable steps via Groq (async, fire after execution)
            try:
                task_desc = task.get("description", "")
                results_summary = json.dumps([
                    {"op": r["op"], "status": r["status"], "detail": r["detail"]}
                    for r in exec_results
                ])
                steps_data = await _call_groq([
                    {"role": "system", "content": _GROQ_STEPS_SYSTEM},
                    {"role": "user", "content": f"Task: {task_desc}\nResults: {results_summary}"},
                ])
                raw_steps = steps_data.get("steps", [])
                steps = [
                    AgentStep(label=s.get("label", ""), status=s.get("status", "done"), detail=s.get("detail"))
                    for s in raw_steps
                ]
            except Exception:
                # Fall back: build steps directly from execution results
                steps = [
                    AgentStep(label=r["detail"], status=r["status"])
                    for r in exec_results
                ]
        else:
            # Gemini produced a task but no operations — show a warning step
            steps = [AgentStep(
                label="No operations were generated — please be more specific about file paths.",
                status="failed"
            )]

    return AgentResponse(
        reply=reply,
        needs_clarification=needs_clarification,
        questions=questions,
        steps=steps,
    )
