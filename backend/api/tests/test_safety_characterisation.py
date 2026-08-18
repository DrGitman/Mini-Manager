"""
Characterisation tests — what the safety logic does TODAY.

Written before the kernel refactor and left unchanged through it. They describe
behaviour, not structure, so if they still pass afterwards the refactor moved
code without moving the goalposts.

Run: backend/api/.venv/Scripts/python.exe -m pytest backend/api/tests -q
"""
from __future__ import annotations

import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3]))

from backend.api.services import kernel


# ─── Protected paths ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("path", [
    r"C:\Windows\System32\drivers\etc\hosts",
    r"C:\Windows\notepad.exe",
    r"C:\Program Files\App\thing.dll",
    r"C:\ProgramData\config.ini",
    r"C:\Users\me\AppData\Roaming\app\file.json",
    r"C:\$Recycle.Bin\thing",
    r"C:\dev\project\node_modules\pkg\index.js",
    r"C:\dev\project\.git\HEAD",
    r"C:\dev\project\venv\pyvenv.cfg",
    r"C:\dev\project\.venv\pyvenv.cfg",
])
def test_protected_paths_are_refused(path):
    assert kernel.is_protected(pathlib.Path(path)) is True


@pytest.mark.parametrize("path", [
    r"C:\Users\me\Downloads\invoice.pdf",
    r"C:\Users\me\Documents\notes.txt",
    r"D:\Projects\client\report.docx",
])
def test_ordinary_user_paths_are_allowed(path):
    assert kernel.is_protected(pathlib.Path(path)) is False


def test_bare_drive_root_is_refused():
    """'Organise C:\\' would otherwise walk the entire disk."""
    assert kernel.is_protected(pathlib.Path("C:\\")) is True


def test_forward_slashes_are_normalised():
    """A protected path written with forward slashes is still protected."""
    assert kernel.is_protected(pathlib.Path("C:/Windows/System32/x.dll")) is True


# ─── No overwrite ─────────────────────────────────────────────────────────────

def test_free_destination_is_returned_unchanged(tmp_path):
    dst = tmp_path / "report.pdf"
    assert kernel.disambiguate(dst) == dst


def test_taken_destination_gets_a_suffix(tmp_path):
    dst = tmp_path / "report.pdf"
    dst.write_text("original")
    assert kernel.disambiguate(dst).name == "report (1).pdf"


def test_suffix_increments_until_free(tmp_path):
    (tmp_path / "report.pdf").write_text("a")
    (tmp_path / "report (1).pdf").write_text("b")
    (tmp_path / "report (2).pdf").write_text("c")
    assert kernel.disambiguate(tmp_path / "report.pdf").name == "report (3).pdf"


def test_disambiguation_never_loses_the_extension(tmp_path):
    dst = tmp_path / "archive.tar.gz"
    dst.write_text("x")
    assert kernel.disambiguate(dst).suffix == ".gz"


# ─── Archive instead of delete ────────────────────────────────────────────────

def test_archive_moves_the_file_rather_than_deleting_it(tmp_path):
    src = tmp_path / "old.txt"
    src.write_text("keep me")

    dest = pathlib.Path(kernel.archive(src))

    assert not src.exists(), "the original should have moved"
    assert dest.exists(), "the archived copy must exist"
    assert dest.read_text() == "keep me", "contents must survive"


def test_archive_lands_beside_the_original(tmp_path):
    """Same drive — a cross-drive move is a copy plus a delete."""
    src = tmp_path / "old.txt"
    src.write_text("x")
    dest = pathlib.Path(kernel.archive(src))
    assert dest.parent.parent == tmp_path


def test_archiving_twice_does_not_overwrite(tmp_path):
    first = tmp_path / "dup.txt"
    first.write_text("first")
    dest_one = pathlib.Path(kernel.archive(first))

    second = tmp_path / "dup.txt"
    second.write_text("second")
    dest_two = pathlib.Path(kernel.archive(second))

    assert dest_one != dest_two
    assert dest_one.read_text() == "first"
    assert dest_two.read_text() == "second"
