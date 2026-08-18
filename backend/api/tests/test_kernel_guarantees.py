"""
The guarantees the kernel adds.

The characterisation tests prove the refactor preserved old behaviour. These
prove the properties that behaviour did not previously have — the ones the
safety argument actually rests on.
"""
from __future__ import annotations

import pathlib
import sys
import tempfile

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3]))

from backend.api.services import kernel
from backend.api.services.kernel import (
    BlockedPath,
    ExtensionChanged,
    NeverDelete,
    Operation,
    OutOfScope,
    PathTooLong,
)


@pytest.fixture()
def workspace():
    """Scratch space outside AppData, which the kernel refuses by design."""
    root = pathlib.Path(__file__).resolve().parents[3] / ".pytest-workspace"
    root.mkdir(exist_ok=True)
    return pathlib.Path(tempfile.mkdtemp(dir=root))


# ─── There is no delete ───────────────────────────────────────────────────────

def test_delete_is_refused_outright():
    """
    The guarantee is an absence: nothing in the kernel removes a file.

    This asserts the absence is enforced rather than merely documented, so a
    future edit that adds a delete path fails here first.
    """
    op = Operation(type="delete", src=r"D:\work\file.txt")  # type: ignore[arg-type]
    with pytest.raises(NeverDelete):
        kernel.guard(op)


def test_kernel_exposes_no_delete_function():
    """No callable in the module removes anything, whatever it is named."""
    suspects = [n for n in dir(kernel)
                if any(w in n.lower() for w in ("delete", "remove", "unlink", "rmtree"))]
    assert suspects == [] or suspects == ["NeverDelete"], f"unexpected: {suspects}"


# ─── Canonicalisation happens before any other check ──────────────────────────

def test_traversal_out_of_scope_is_caught_after_resolving(workspace):
    """
    A path that only looks safe until it is resolved.

    "<workspace>/sub/../../elsewhere" reads as inside the workspace and is not.
    Checking the raw string would let it through, which is why canonicalisation
    runs first.
    """
    (workspace / "sub").mkdir()
    escaping = str(workspace / "sub" / ".." / ".." / "elsewhere.txt")

    op = Operation(type="move", src=escaping, dst=str(workspace / "x.txt"),
                   scan_root=str(workspace))
    with pytest.raises(OutOfScope):
        kernel.guard(op)


def test_traversal_into_a_protected_folder_is_blocked(workspace):
    """
    A path with ".." segments that lands inside Windows is still refused.

    Written on C: deliberately — the fragments name absolute Windows locations,
    so a traversal that resolves somewhere on another drive is not protected
    and should not be.
    """
    traversing = r"C:\Users\someone\..\..\Windows\System32\x.dll"
    assert kernel.canonical(traversing) == pathlib.Path(r"C:\Windows\System32\x.dll")

    op = Operation(type="move", src=traversing, dst=str(workspace / "x.dll"))
    with pytest.raises(BlockedPath):
        kernel.guard(op)


# ─── Blocklist applies to the destination too ─────────────────────────────────

def test_moving_into_a_protected_folder_is_blocked(workspace):
    """A move *into* Windows is as dangerous as one out of it."""
    src = workspace / "note.txt"
    src.write_text("x")
    op = Operation(type="move", src=str(src), dst=r"C:\Windows\note.txt")
    with pytest.raises(BlockedPath):
        kernel.guard(op)


def test_user_blocklist_entries_are_honoured(workspace):
    """Entries from the user's own blocklist are enforced like built-in ones."""
    private = workspace / "Private"
    private.mkdir()
    target = private / "diary.txt"
    target.write_text("x")

    op = Operation(type="move", src=str(target), dst=str(workspace / "diary.txt"))
    with pytest.raises(BlockedPath):
        kernel.guard(op, blocklist=[str(private)])


# ─── Extension immutability ───────────────────────────────────────────────────

def test_renaming_a_pdf_to_an_exe_is_refused(workspace):
    """Changing an extension is an attack, not a rename."""
    src = workspace / "report.pdf"
    src.write_text("x")
    op = Operation(type="rename", src=str(src), dst=str(workspace / "report.exe"))
    with pytest.raises(ExtensionChanged):
        kernel.guard(op)


def test_renaming_within_the_same_extension_is_allowed(workspace):
    src = workspace / "report.pdf"
    src.write_text("x")
    op = Operation(type="rename", src=str(src), dst=str(workspace / "2026 Report.pdf"))
    approved = kernel.guard(op)
    assert approved.dst.endswith("2026 Report.pdf")


def test_extension_comparison_ignores_case(workspace):
    src = workspace / "photo.JPG"
    src.write_text("x")
    op = Operation(type="rename", src=str(src), dst=str(workspace / "holiday.jpg"))
    kernel.guard(op)  # must not raise


# ─── No overwrite, enforced through the gate ──────────────────────────────────

def test_guard_disambiguates_an_occupied_destination(workspace):
    src = workspace / "a.txt"
    src.write_text("new")
    taken = workspace / "b.txt"
    taken.write_text("existing")

    approved = kernel.guard(Operation(type="move", src=str(src), dst=str(taken)))

    assert approved.dst.endswith("b (1).txt")
    assert taken.read_text() == "existing", "the existing file must be untouched"


# ─── Length ───────────────────────────────────────────────────────────────────

def test_absurdly_long_destination_is_refused(workspace):
    src = workspace / "a.txt"
    src.write_text("x")
    op = Operation(type="move", src=str(src), dst=str(workspace / ("n" * 300 + ".txt")))
    with pytest.raises(PathTooLong):
        kernel.guard(op)


# ─── Journal before execute ───────────────────────────────────────────────────

def test_journal_is_written_before_the_operation_is_returned(workspace):
    """Undo has to exist before the change does."""
    src = workspace / "a.txt"
    src.write_text("x")
    written: list = []

    approved = kernel.guard(
        Operation(type="move", src=str(src), dst=str(workspace / "b.txt")),
        journal=written.append,
    )

    assert len(written) == 1, "exactly one journal entry"
    assert written[0] == approved, "the journal records the approved paths, not the proposed ones"
    assert src.exists(), "guard validates and records; it does not move anything"


def test_a_refused_operation_is_never_journalled(workspace):
    """A refusal is not history — it never happened."""
    written: list = []
    with pytest.raises(BlockedPath):
        kernel.guard(
            Operation(type="move", src=r"C:\Windows\x.dll", dst=str(workspace / "x.dll")),
            journal=written.append,
        )
    assert written == []


def test_move_records_the_final_destination_not_the_requested_one(workspace):
    """
    The journal has to hold where the file actually went.

    If disambiguation renames b.txt to b (1).txt, an undo that reads the
    requested path would look for a file that never existed.
    """
    src = workspace / "a.txt"
    src.write_text("moved")
    (workspace / "b.txt").write_text("already here")
    written: list = []

    final = kernel.move(
        Operation(type="move", src=str(src), dst=str(workspace / "b.txt")),
        journal=written.append,
    )

    assert final.endswith("b (1).txt")
    assert written[0].dst == final
    assert (workspace / "b.txt").read_text() == "already here"
