"""
The safety kernel.

Every filesystem mutation passes through here. Not a prompt, not a hook, not
something an agent can be persuaded around — plain deterministic Python that
runs unconditionally before anything touches a disk.

The organising idea is that the agent has judgement but no privileges:

    The agent proposes. The kernel disposes.

Two properties matter more than any individual check.

**There is no delete.** Not a guarded delete, not a delete behind a flag — no
code path in this module removes a file. `archive()` moves things aside. A
model cannot instruct a deletion because no function here performs one.

**The caller cannot supply a raw destination.** `guard()` re-derives and
re-validates every path it is given. A path that came from model output is
canonicalised and checked against the blocklist at execution time, not at the
time it was proposed.

This module is the server half of a **return-of-control** split — the Strands
reference pattern where the backend reasons and plans while the client executes
the tools that need local access. The kernel validates and records here; the
desktop app performs the move there, behind its own independent guard.

Checks run in a fixed order, and the order is load-bearing: canonicalisation
first, because every check after it reasons about the resolved path. Validating
before resolving is how a path with ".." segments gets through.
"""

from __future__ import annotations

import logging
import ntpath
import pathlib
import posixpath
import shutil
from dataclasses import dataclass, replace
from typing import Iterable, Literal, Optional

logger = logging.getLogger(__name__)


# ─── Limits ───────────────────────────────────────────────────────────────────

# Windows refuses paths beyond this without long-path support enabled, and the
# failure surfaces as a confusing OSError deep inside shutil.
MAX_PATH = 259

# Substrings that mark a path as off-limits. Matched against the lowercased
# path with separators normalised to backslashes, so "C:/Windows/x" and
# "C:\Windows\x" are both caught.
PROTECTED_FRAGMENTS: tuple[str, ...] = (
    "c:\\windows", "c:\\program files", "c:\\programdata",
    "\\appdata\\", "\\system32", "\\$recycle.bin",
    "node_modules", "\\.git\\", "\\venv\\", "\\.venv\\",
)

ARCHIVE_DIR_NAME = "_Mini Manager Archive"


# ─── Refusals ─────────────────────────────────────────────────────────────────

class KernelRefusal(Exception):
    """The kernel declined an operation. Never retried, never worked around."""

    def __init__(self, reason: str, path: str = "") -> None:
        self.reason = reason
        self.path = path
        super().__init__(f"{reason}{f': {path}' if path else ''}")


class BlockedPath(KernelRefusal):
    def __init__(self, path: str) -> None:
        super().__init__("That path is a system or development folder", path)


class OutOfScope(KernelRefusal):
    def __init__(self, path: str) -> None:
        super().__init__("That path is outside the folder being worked on", path)


class ExtensionChanged(KernelRefusal):
    def __init__(self, path: str) -> None:
        super().__init__("An operation may not change a file's extension", path)


class PathTooLong(KernelRefusal):
    def __init__(self, path: str) -> None:
        super().__init__(f"That path is longer than {MAX_PATH} characters", path)


class NeverDelete(KernelRefusal):
    """
    Raised if a delete ever reaches the kernel.

    Nothing in this module deletes, so this exists to make the guarantee
    testable rather than merely stated. If it is ever raised, something
    upstream invented an operation type that has no implementation.
    """

    def __init__(self, path: str = "") -> None:
        super().__init__("Deleting is not something this application does", path)


# ─── The operation the kernel validates ───────────────────────────────────────

OpType = Literal["move", "rename", "archive", "create_folder"]


@dataclass(frozen=True)
class Operation:
    """One proposed filesystem change. Immutable — the kernel returns a new one."""
    type: OpType
    src: str
    dst: str = ""
    scan_root: str = ""


# ─── Individual checks ────────────────────────────────────────────────────────

def canonical(path: str | pathlib.Path) -> pathlib.Path:
    """
    Normalise a path before anything reasons about it.

    Must run first. A path containing ".." segments only reveals itself as
    protected once collapsed, so a blocklist check on the raw string is
    security theatre.

    **Purely lexical — this never touches a filesystem.** Under
    return-of-control the kernel validates the *user's* paths while running on
    a *server*, and those paths do not exist here. `Path.resolve()` silently
    treats an unrecognised path as relative and rebases it onto the server's
    working directory, which turned "D:\\Sandbox\\Downloads\\notes.txt" into
    "/opt/render/project/src/Documents/notes.txt" — a real destination, on the
    wrong machine entirely.

    Windows semantics are chosen by the shape of the path rather than by the
    host OS, so a Windows path is normalised the same way whether this runs on
    the user's laptop or a Linux container.
    """
    raw = str(path).strip()
    looks_windows = (len(raw) > 1 and raw[1] == ":") or "\\" in raw
    normalised = ntpath.normpath(raw) if looks_windows else posixpath.normpath(raw)
    return pathlib.PureWindowsPath(normalised) if looks_windows else pathlib.PurePosixPath(normalised)


def is_protected(path: pathlib.Path, extra: Optional[Iterable[str]] = None) -> bool:
    """
    True if this path must never be touched.

    `extra` carries the user's own blocklist entries, loaded by the caller from
    blocklist.py::load_blocklist_paths. The kernel does not reach into the
    database itself — it stays synchronous and trivially testable.
    """
    p = str(path).lower().replace("/", "\\")

    if any(frag in p for frag in PROTECTED_FRAGMENTS):
        return True

    for entry in (extra or ()):
        entry = (entry or "").lower().replace("/", "\\").rstrip("\\")
        if entry and (p == entry or p.startswith(entry + "\\")):
            return True

    # A bare drive root — "organise C:\" would otherwise walk the whole disk.
    return len(path.parts) <= 1


def is_within(root: pathlib.Path, path: pathlib.Path) -> bool:
    """True if `path` sits inside `root`. Both must already be canonical."""
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def same_extension(src: pathlib.Path, dst: pathlib.Path) -> bool:
    """
    Renaming report.pdf to report.exe is an attack, not a rename.

    Compared case-insensitively; a folder (no suffix on either side) passes.
    """
    return src.suffix.lower() == dst.suffix.lower()


def disambiguate(dst: pathlib.PurePath | pathlib.Path | str) -> pathlib.Path:
    """
    Never overwrite. Appends " (1)", " (2)" … until the name is free.

    Silent overwriting is the one failure mode a user cannot undo from the
    journal, because the original bytes are already gone.

    Only meaningful where the files are: this asks the local filesystem what
    exists. canonical() returns a PurePath precisely because it must NOT do
    that, so this converts to a concrete Path deliberately rather than by
    accident.
    """
    dst = pathlib.Path(str(dst))
    if not dst.exists():
        return dst
    stem, suffix = dst.stem, dst.suffix
    i = 1
    while True:
        candidate = dst.parent / f"{stem} ({i}){suffix}"
        if not candidate.exists():
            return candidate
        i += 1


# ─── The gate ─────────────────────────────────────────────────────────────────

def guard(
    op: Operation,
    blocklist: Optional[Iterable[str]] = None,
    journal=None,
    check_filesystem: bool = False,
) -> Operation:
    """
    Validate one operation and return it with a safe, resolved destination.

    Raises KernelRefusal if the operation must not proceed. The caller executes
    only what comes back from here, and only ever uses the returned paths —
    using the originals would defeat canonicalisation and disambiguation.

    `journal` is an optional callable invoked with the approved operation
    *before* it is returned, so the undo record exists before the change does.
    """
    if op.type == "delete":            # type: ignore[comparison-overlap]
        raise NeverDelete(op.src)

    # 1. Canonicalise first — every check below reasons about the resolved path.
    src = canonical(op.src)
    dst = canonical(op.dst) if op.dst else src

    # 2. Blocklist, on both ends. A move *into* Windows is as bad as out of it.
    if is_protected(src, blocklist):
        raise BlockedPath(str(src))
    if is_protected(dst, blocklist):
        raise BlockedPath(str(dst))

    # 3. Scope. Optional, because some operations are legitimately cross-folder,
    #    but when a root is given nothing may escape it.
    if op.scan_root:
        root = canonical(op.scan_root)
        if not is_within(root, src):
            raise OutOfScope(str(src))

    # 4. Extension immutability, for operations that produce a new filename.
    if op.type in ("move", "rename") and op.dst and src.suffix:
        if not same_extension(src, dst):
            raise ExtensionChanged(f"{src.name} -> {dst.name}")

    # 5. Never overwrite.
    #
    # Only meaningful on the machine that owns the files. When the kernel is
    # planning server-side, the destination does not exist here and asking
    # whether it does would answer about the wrong disk — so the device
    # disambiguates at execution time, where the answer is true. Its executor
    # never overwrites either; this is one check in two places, not a gap.
    if op.dst and check_filesystem:
        dst = disambiguate(dst)

    # 6. Length, checked last because disambiguation can add characters.
    if len(str(dst)) > MAX_PATH:
        raise PathTooLong(str(dst))

    approved = replace(op, src=str(src), dst=str(dst) if op.dst else "")

    # 7. Journal before execute. Undo must exist before the change does.
    if journal is not None:
        journal(approved)

    return approved


# ─── The only mutations this module performs ──────────────────────────────────

def archive_dir_for(original: pathlib.Path) -> pathlib.Path:
    """
    Where archived things go: beside the original, so the move stays on one
    drive. A cross-drive move is a copy followed by a delete, which is exactly
    what this module exists to avoid.
    """
    root = original.parent / ARCHIVE_DIR_NAME
    root.mkdir(parents=True, exist_ok=True)
    return root


def archive(path: pathlib.Path, blocklist: Optional[Iterable[str]] = None) -> str:
    """
    Move something aside instead of deleting it. Returns the new location.

    This is what "delete" means in this application. The file keeps existing,
    keeps its contents, and can be restored from the Archive page.
    """
    checked = canonical(path)
    if is_protected(checked, blocklist):
        raise BlockedPath(str(checked))

    # archive() runs where the files are, so a concrete Path is correct here.
    src = pathlib.Path(str(checked))
    dest = disambiguate(archive_dir_for(src) / src.name)
    if len(str(dest)) > MAX_PATH:
        raise PathTooLong(str(dest))

    shutil.move(str(src), str(dest))
    logger.info("Archived %s", src.name)
    return str(dest)


def move(op: Operation, blocklist: Optional[Iterable[str]] = None, journal=None) -> str:
    """
    Execute a guarded move on this machine. Returns where the file ended up.

    Only for use where the files actually live — it checks and touches the
    filesystem, so check_filesystem is on.
    """
    approved = guard(op, blocklist=blocklist, journal=journal, check_filesystem=True)
    dest = pathlib.Path(approved.dst)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(approved.src, str(dest))
    return str(dest)
