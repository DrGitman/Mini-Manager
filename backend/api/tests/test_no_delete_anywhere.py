"""
No part of the application destroys a file.

There was already a test for this, and it passed the whole time the app could
delete: `test_kernel_exposes_no_delete_function` only ever looked at the kernel
module, and the delete lived in the legacy agent route and in the Electron
executor. The claim in the README was global; the test was not. Which is the
lesson — a guarantee is only as wide as the thing checking it.

So this checks the whole surface: the operation allowlist the model is given,
the server-side executor, and the desktop executor.

The one permitted exception is the cross-device move fallback, where a file is
copied to its destination and the source is then dropped. That is the second
half of a move and the file exists at `dest` before it runs, so it is named
explicitly rather than matched loosely — a future unlink that is genuinely a
delete will not be mistaken for it.
"""
from __future__ import annotations

import pathlib
import re

import pytest

APP = pathlib.Path(__file__).resolve().parents[3]
AGENT_PY = APP / "backend" / "api" / "routers" / "agent.py"
MAIN_JS = APP / "electron" / "main.js"

# Calls that remove data with no way back.
DESTRUCTIVE = [
    r"shutil\.rmtree",
    r"os\.remove\b",
    r"os\.unlink\b",
    r"os\.rmdir\b",
    r"fs\.rmSync",
    r"fs\.rmdirSync",
    r"\brmtree\b",
]

# Line numbers are not used — the two allowed sites are identified by the copy
# that must immediately precede them, so moving the code does not break this and
# adding a bare unlink elsewhere does.
EXDEV_COPY = re.compile(r"copyFileSync\([^)]*\)\s*\n\s*fs\.unlinkSync\(")


def _code_lines(path: pathlib.Path) -> list[tuple[int, str]]:
    """Source lines with comments stripped, so prose about delete does not count."""
    out = []
    for i, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = re.sub(r"//.*$", "", raw)
        line = re.sub(r"#.*$", "", line)
        if line.strip():
            out.append((i, line))
    return out


@pytest.mark.parametrize("path", [AGENT_PY, MAIN_JS], ids=["agent.py", "electron/main.js"])
def test_no_destructive_calls(path: pathlib.Path):
    """Nothing in either executor removes a file outright."""
    hits = [(n, l.strip()) for n, l in _code_lines(path)
            for pat in DESTRUCTIVE if re.search(pat, l)]
    assert hits == [], f"destructive call in {path.name}: {hits}"


def test_every_unlink_is_a_cross_device_move():
    """
    `fs.unlinkSync` may appear only as the tail of a copy-then-remove move.

    Asserts the copy is present rather than asserting the delete is absent —
    the point is that the file exists somewhere else first.
    """
    src = MAIN_JS.read_text(encoding="utf-8")
    total = len(re.findall(r"fs\.unlinkSync\(", src))
    paired = len(EXDEV_COPY.findall(src))
    assert total == paired, (
        f"{total} unlinkSync calls but only {paired} preceded by copyFileSync — "
        "an unlink that is not the second half of a move deletes data"
    )


def test_permanent_delete_operations_do_not_exist():
    """
    The model cannot emit an operation that destroys anything.

    Checks the allowlist and the prompt together: an operation removed from the
    allowlist but still described in the prompt would have the model asking for
    something that gets refused, which reads to a user as the agent failing.
    """
    src = AGENT_PY.read_text(encoding="utf-8")
    code = "\n".join(l for _, l in _code_lines(AGENT_PY))
    assert "permanently_delete" not in code, \
        "a permanent-delete operation type is still live in agent.py"
    # The prompt is a string literal, so it survives comment stripping above.
    assert '"type": "permanently_delete' not in src, \
        "the model is still being told it can permanently delete"


def test_the_agents_own_tools_have_no_delete():
    """The Strands tool layer, checked the same way as the legacy route."""
    tools = APP / "backend" / "api" / "services" / "agent_tools.py"
    hits = [(n, l.strip()) for n, l in _code_lines(tools)
            for pat in DESTRUCTIVE if re.search(pat, l)]
    assert hits == [], f"destructive call in agent_tools.py: {hits}"
