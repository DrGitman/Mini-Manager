"""POST /agent — Groq LLM plans + emits typed operations, backend executes them for real."""

from __future__ import annotations

import json
import logging
import pathlib
import shutil
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from .notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])

_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = settings.groq_model

# ─── Prompts ──────────────────────────────────────────────────────────────────

_GEMINI_SYSTEM = r"""You are Mini Manager, an AI file management assistant that ACTUALLY EXECUTES operations on the user's local file system.

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
- {"type": "delete_folder_recursive", "path": "C:\\path\\folder"}
  → deletes folder and ALL its contents (use when user says "delete folder")
- {"type": "delete_file", "path": "C:\\path\\file.txt"}
  → deletes a single file
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

FILE CONTEXT RULES:
- If a FILE CONTEXT block is present in the user message, use it to answer questions about what files exist.
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

            # ── delete_folder_recursive ───────────────────────────────────────
            elif t == "delete_folder_recursive":
                p = pathlib.Path(op["path"])
                if not p.exists():
                    results.append({"op": t, "status": "done", "detail": f"{p.name} already gone"})
                    continue
                count = sum(1 for _ in p.rglob("*"))
                shutil.rmtree(str(p))
                results.append({"op": t, "status": "done", "detail": f"Deleted {p.name} ({count} items)"})

            # ── delete_file ───────────────────────────────────────────────────
            elif t == "delete_file":
                p = pathlib.Path(op["path"])
                if not p.exists():
                    results.append({"op": t, "status": "done", "detail": f"{p.name} already gone"})
                    continue
                p.unlink()
                results.append({"op": t, "status": "done", "detail": f"Deleted {p.name}"})

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

async def _call_groq(messages: list[dict], temperature: float = 0.2) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            _GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
            json={"model": _GROQ_MODEL, "messages": messages, "temperature": temperature, "response_format": {"type": "json_object"}},
        )
        resp.raise_for_status()
        return json.loads(resp.json()["choices"][0]["message"]["content"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AgentMessage(BaseModel):
    role: str
    content: str

class AgentRequest(BaseModel):
    messages: list[AgentMessage]
    folder_context: Optional[str] = None
    file_listing: Optional[list[dict]] = None  # [{folder, files: [{name, ext, size_kb, path}]}]

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
        lines = [
            "FILE CONTEXT (real files from the user's scan scope folders):",
            "Use this to answer questions about files, filter by topic, or build operations.",
            "Format: filename | extension | size | full_path",
        ]
        for folder_entry in body.file_listing:
            folder_name = folder_entry.get("folder", "Unknown")
            files = folder_entry.get("files", [])
            lines.append(f"\n📁 {folder_name} — {len(files)} files:")
            for f in files[:200]:  # cap per folder
                size_str = f"{f.get('size_kb', 0):.0f}KB"
                ext = f.get("ext", "")
                path = f.get("path", f["name"])
                lines.append(f"  {f['name']} | {ext} | {size_str} | {path}")
            if len(files) > 200:
                lines.append(f"  ... {len(files) - 200} more files not shown")
        context_parts.append("\n".join(lines))

    if context_parts:
        messages[-1]["content"] = "\n\n".join(context_parts) + "\n\n" + messages[-1]["content"]

    steps: list[AgentStep] = []

    # ── Phase 1: Groq understands + emits typed operations ────────────────────
    groq_data = await _call_groq([
        {"role": "system", "content": _GEMINI_SYSTEM},
        *messages,
    ])

    reply = groq_data.get("reply", "")
    needs_clarification = bool(groq_data.get("needs_clarification", False))
    raw_questions = groq_data.get("questions", [])
    task = groq_data.get("task")
    logger.info("Groq reply: %s", reply)
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
    if task and not needs_clarification:
        operations: list[dict] = task.get("operations", [])
        logger.info("Operations to execute: %s", json.dumps(operations))

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
