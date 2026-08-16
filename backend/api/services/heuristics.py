"""
Rule-based pre-filter — mirrors the frontend lib/heuristics.ts logic.

Files with high-confidence extension or keyword matches are classified
locally so they never reach Gemini (saving tokens).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from ..models.schemas import ClassificationResult, FileItem

# ─── Sensitivity detection ───────────────────────────────────────────────────
# Heuristic results never reach the AI, so without this a file like
# "passport_scan.jpg" would be filed as an ordinary image with no warning.
# Ordered most-specific first; the first match wins.

_SENSITIVITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("identity", re.compile(
        r"\b(passport|national[\s_-]?id|identity[\s_-]?card|id[\s_-]?card|"
        r"drivers?[\s_-]?licen[cs]e|birth[\s_-]?certificate|social[\s_-]?security|"
        r"\bssn\b|visa[\s_-]?application|residence[\s_-]?permit)\b",
        re.IGNORECASE)),
    ("financial", re.compile(
        r"\b(bank[\s_-]?statement|payslip|pay[\s_-]?stub|salary|tax[\s_-]?return|"
        r"\bw2\b|\bp60\b|irs|invoice|receipt|credit[\s_-]?card|iban|swift|"
        r"account[\s_-]?statement|insurance[\s_-]?policy|mortgage|loan[\s_-]?agreement)\b",
        re.IGNORECASE)),
    ("personal", re.compile(
        r"\b(medical|health[\s_-]?record|prescription|diagnosis|contract|"
        r"will[\s_-]?and[\s_-]?testament|confidential|private|password|"
        r"recovery[\s_-]?codes?|secret)\b",
        re.IGNORECASE)),
]


def detect_sensitivity(name: str) -> str:
    """
    Classify a filename as identity / financial / personal, else 'none'.

    The name is normalised first: `_`, `-` and `.` are word characters as far as
    regex `\\b` is concerned, so "passport_scan.jpg" would not match `\\bpassport\\b`
    without this.
    """
    normalised = re.sub(r"[_\-.]+", " ", name)
    for label, pattern in _SENSITIVITY_PATTERNS:
        if pattern.search(normalised):
            return label
    return "none"


# ─── Extension → category/folder ─────────────────────────────────────────────

_EXT_MAP: dict[str, tuple[str, str]] = {
    # (category, target_folder)
    ".jpg":   ("Images",    "Images"),
    ".jpeg":  ("Images",    "Images"),
    ".png":   ("Images",    "Images"),
    ".gif":   ("Images",    "Images"),
    ".webp":  ("Images",    "Images"),
    ".svg":   ("Images",    "Images"),
    ".heic":  ("Images",    "Images"),
    ".mp4":   ("Videos",    "Videos"),
    ".mov":   ("Videos",    "Videos"),
    ".mkv":   ("Videos",    "Videos"),
    ".avi":   ("Videos",    "Videos"),
    ".mp3":   ("Audio",     "Audio"),
    ".wav":   ("Audio",     "Audio"),
    ".flac":  ("Audio",     "Audio"),
    ".aac":   ("Audio",     "Audio"),
    ".zip":   ("Archives",  "Archives"),
    ".rar":   ("Archives",  "Archives"),
    ".7z":    ("Archives",  "Archives"),
    ".tar":   ("Archives",  "Archives"),
    ".gz":    ("Archives",  "Archives"),
    ".py":    ("Code",      "Code"),
    ".js":    ("Code",      "Code"),
    ".ts":    ("Code",      "Code"),
    ".go":    ("Code",      "Code"),
    ".rs":    ("Code",      "Code"),
    ".java":  ("Code",      "Code"),
    ".cpp":   ("Code",      "Code"),
    ".c":     ("Code",      "Code"),
    ".cs":    ("Code",      "Code"),
    ".rb":    ("Code",      "Code"),
    ".php":   ("Code",      "Code"),
    ".psd":   ("Design",    "Design"),
    ".ai":    ("Design",    "Design"),
    ".fig":   ("Design",    "Design"),
    ".sketch": ("Design",   "Design"),
    ".xd":    ("Design",    "Design"),
    ".xlsx":  ("Data",      "Data"),
    ".csv":   ("Data",      "Data"),
    ".numbers": ("Data",    "Data"),
    ".pdf":   ("Documents", "Documents"),
    ".doc":   ("Documents", "Documents"),
    ".docx":  ("Documents", "Documents"),
    ".txt":   ("Documents", "Documents"),
    ".odt":   ("Documents", "Documents"),
    ".rtf":   ("Documents", "Documents"),
    ".ppt":   ("Documents", "Documents"),
    ".pptx":  ("Documents", "Documents"),
}

# Confidence for pure extension matches
_EXT_CONFIDENCE = 0.93

# ─── Keyword hints ────────────────────────────────────────────────────────────

@dataclass
class _KeywordHint:
    pattern: re.Pattern[str]
    category: str
    target_folder: str
    confidence: float


_KEYWORD_HINTS: list[_KeywordHint] = [
    _KeywordHint(re.compile(r"invoice|receipt|billing|payment", re.I),  "Finance",     "Documents/Finance",       0.92),
    _KeywordHint(re.compile(r"resume|cv\b|cover[ _-]?letter",  re.I),  "Career",      "Documents/Career",        0.90),
    _KeywordHint(re.compile(r"screenshot|screen[ _-]?shot|capture", re.I), "Screenshots", "Images/Screenshots",  0.95),
    _KeywordHint(re.compile(r"tax|w2|1099|irs",                 re.I),  "Taxes",       "Documents/Finance/Taxes", 0.90),
    _KeywordHint(re.compile(r"contract|agreement|nda|lease",    re.I),  "Legal",       "Documents/Legal",         0.88),
    _KeywordHint(re.compile(r"ticket|boarding|itinerary|booking", re.I),"Travel",      "Documents/Travel",        0.85),
]

# Minimum confidence to skip Gemini entirely
SKIP_AI_THRESHOLD = 0.85


# ─── Name cleaning ────────────────────────────────────────────────────────────

def _clean_subject(name: str, extension: str) -> str:
    base = name[: len(name) - len(extension)] if name.endswith(extension) else name
    base = re.sub(r"[_\s]+", "-", base)
    base = re.sub(r"\(\d+\)", "", base)
    base = re.sub(r"\b(copy|final|final2|new|untitled|document|img|dsc|scan)\b", "", base, flags=re.I)
    base = re.sub(r"\d{8,}", "", base)
    base = re.sub(r"-{2,}", "-", base)
    base = base.strip("-")
    if not base:
        base = "file"
    return "-".join(w.capitalize() for w in base.split("-") if w)


def _make_name(file: FileItem, subject: str) -> str:
    return f"{subject}{file.extension}"


# ─── Public API ───────────────────────────────────────────────────────────────

def run_heuristics(
    files: list[FileItem],
) -> tuple[list[ClassificationResult], list[FileItem]]:
    """
    Returns (resolved_results, ambiguous_files).

    resolved_results — files classified locally (no Gemini needed)
    ambiguous_files  — files that should be sent to Gemini
    """
    resolved: list[ClassificationResult] = []
    ambiguous: list[FileItem] = []

    for file in files:
        ext = file.extension.lower()
        stem = file.name
        sensitivity = detect_sensitivity(stem)

        # A sensitive file must never be silently fast-pathed — send it to the
        # AI so it gets a proper review and an explicit flag.
        if sensitivity != "none":
            ambiguous.append(file)
            continue

        # 1. Keyword hints take priority (can override extension category)
        matched_hint: Optional[_KeywordHint] = None
        for hint in _KEYWORD_HINTS:
            if hint.pattern.search(stem):
                matched_hint = hint
                break

        if matched_hint and matched_hint.confidence >= SKIP_AI_THRESHOLD:
            subject = _clean_subject(stem, file.extension)
            resolved.append(
                ClassificationResult(
                    id=file.id,
                    category=matched_hint.category,
                    new_name=_make_name(file, subject),
                    target_folder=matched_hint.target_folder,
                    confidence=matched_hint.confidence,
                    reason=f"File name suggests {matched_hint.category.lower()} content",
                    source="heuristic",
                )
            )
            continue

        # 2. Extension match
        if ext in _EXT_MAP:
            category, folder = _EXT_MAP[ext]
            subject = _clean_subject(stem, file.extension)
            resolved.append(
                ClassificationResult(
                    id=file.id,
                    category=category,
                    new_name=_make_name(file, subject),
                    target_folder=folder,
                    confidence=_EXT_CONFIDENCE,
                    reason=f"{file.extension} files are classified as {category.lower()}",
                    source="heuristic",
                )
            )
            continue

        # 3. Ambiguous — send to Gemini
        ambiguous.append(file)

    return resolved, ambiguous
