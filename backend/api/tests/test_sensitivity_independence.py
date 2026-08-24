"""
A private file must escalate even when check_sensitive never runs.

The agent chooses which tools to call, so a guarantee that depends on it
choosing correctly every time is not a guarantee. This was observed failing,
not theorised: a run classified passport_scan.jpg at 0.97 confidence and marked
it `auto`, because the model went straight from classify_files to
propose_changes and never called check_sensitive.

Same principle as the safety kernel — a protection that only holds when an
earlier step remembers to fire belongs further down.
"""
from __future__ import annotations

import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3]))

from backend.api.services import agent_tools


class _State:
    def __init__(self, data: dict) -> None:
        self.data = data

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value) -> None:
        self.data[key] = value


class _Agent:
    """Just enough agent for a tool that only touches state."""
    def __init__(self, data: dict) -> None:
        self.state = _State(data)


PREFS = {"auto_threshold": 0.85, "review_threshold": 0.70}


def _propose(files: list[dict]) -> dict[str, dict]:
    agent = _Agent({
        agent_tools.CLASSIFICATIONS_KEY: {"files": files},
        agent_tools.PREFS_KEY: PREFS,
    })
    agent_tools.propose_changes(agent=agent)
    proposal = agent.state.get(agent_tools.PROPOSAL_KEY) or {}
    return {f["name"]: f for f in proposal.get("files", [])}


# Classifications exactly as they arrive when check_sensitive was never called:
# high confidence, and no sensitivity field at all.
UNCHECKED = [
    {"name": "passport_scan.jpg", "confidence": 0.97,
     "target_folder": "Documents", "path": r"D:\S\passport_scan.jpg"},
    {"name": "bank_statement_march.pdf", "confidence": 0.95,
     "target_folder": "Finance", "path": r"D:\S\bank_statement_march.pdf"},
    {"name": "holiday.jpg", "confidence": 0.96,
     "target_folder": "Images", "path": r"D:\S\holiday.jpg"},
    {"name": "notes.txt", "confidence": 0.93,
     "target_folder": "Documents", "path": r"D:\S\notes.txt"},
]


@pytest.mark.parametrize("filename", [
    "passport_scan.jpg",
    "bank_statement_march.pdf",
])
def test_private_files_escalate_without_the_sensitivity_tool(filename):
    """Confidence is irrelevant — a correct guess about a passport is still theirs to make."""
    result = _propose([dict(f) for f in UNCHECKED])
    assert result[filename]["disposition"] == "escalate", result[filename]


@pytest.mark.parametrize("filename", ["holiday.jpg", "notes.txt"])
def test_ordinary_confident_files_are_still_applied(filename):
    """The guard must not become 'escalate everything', which would be useless."""
    result = _propose([dict(f) for f in UNCHECKED])
    assert result[filename]["disposition"] == "auto", result[filename]


def test_a_recorded_sensitivity_a_filename_cannot_reveal_is_honoured():
    """
    check_sensitive can see things a filename cannot — a scan called
    "scan001.pdf" that turns out to be an ID. Re-deriving must not discard that.
    """
    result = _propose([{
        "name": "scan001.pdf", "confidence": 0.99, "sensitivity": "identity",
        "target_folder": "Documents", "path": r"D:\S\scan001.pdf",
    }])
    assert result["scan001.pdf"]["disposition"] == "escalate", result
