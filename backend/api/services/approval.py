"""
The approval hook — policy, not physics.

Two layers protect a filesystem change, and confusing them is how one of them
quietly stops working:

    This hook decides whether to ASK the user.
    The kernel decides what is PHYSICALLY PERMITTED.

The hook is registered, configurable, and therefore skippable — a bug could
prevent it firing. So it may only ever *add* friction, never grant permission.
The kernel is called unconditionally inside every Tier 3 tool, so a hook that
fails to register cannot produce an unsafe operation. It can only produce an
unasked-for one, which is a smaller failure and a recoverable one.

What this enforces: `apply_changes` may only ever carry out work that
`propose_changes` marked `auto`. If anything else has reached it — because the
model asked for the wrong set, or because a proposal changed underneath it —
the agent is interrupted and the user decides.
"""

from __future__ import annotations

import logging
from typing import Any

from strands.hooks import BeforeToolCallEvent, HookProvider, HookRegistry

from .agent_tools import PROPOSAL_KEY

logger = logging.getLogger(__name__)

# Tools that change something. Everything else runs without interruption,
# because asking about a read is noise, and noise is what makes people stop
# reading the questions that matter.
MUTATING_TOOLS = {"apply_changes", "quarantine", "restore", "undo_batch"}


class ApprovalHook(HookProvider):
    """
    Interrupts the agent before a mutation that has not been approved.

    The interrupt carries the offending files as its `reason`, so the client can
    render a real decision rather than a yes/no prompt. That is why this is a
    hook rather than the vended HumanInTheLoop handler: the escalation is a
    durable object with options, not a console confirmation.
    """

    def __init__(self, agent_state_reader=None) -> None:
        # Injected so tests can drive the hook without building a whole agent.
        self._read_state = agent_state_reader

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self.check)

    # ── The check ────────────────────────────────────────────────────────────

    def check(self, event: BeforeToolCallEvent) -> None:
        name = event.tool_use.get("name")
        if name not in MUTATING_TOOLS:
            return

        agent = getattr(event, "agent", None)
        proposal = self._proposal(agent)
        files = (proposal or {}).get("files") or []

        # Nothing proposed means nothing was decided. Refuse rather than ask —
        # there is no question to put to the user yet.
        if not files:
            event.cancel_tool = (
                "There is no reviewed plan to apply. Run propose_changes first."
            )
            logger.info("approval: %s cancelled — no proposal in state", name)
            return

        requested = (event.tool_use.get("input") or {}).get("disposition", "auto")
        unapproved = [
            f for f in files
            if f.get("disposition") == requested and requested != "auto"
        ]
        # Anything private, whatever set it was filed under.
        private = [f for f in files
                   if f.get("disposition") == requested
                   and f.get("sensitivity", "none") != "none"]

        needs_asking = unapproved or private
        if not needs_asking:
            return

        answer = event.interrupt(
            "mini-manager-approval",
            reason={
                "tool": name,
                "disposition": requested,
                "files": [
                    {"name": f.get("name"),
                     "target": f.get("target_folder"),
                     "why": f.get("why"),
                     "sensitivity": f.get("sensitivity", "none")}
                    for f in needs_asking
                ],
                "question": (
                    f"{len(needs_asking)} of these need your decision before I move them."
                ),
                "options": ["Apply them", "Skip them", "Cancel"],
            },
        )

        if str(answer).strip().lower() not in ("apply them", "apply", "yes", "y"):
            event.cancel_tool = f"The user declined: {answer}"
            logger.info("approval: %s cancelled by user (%r)", name, answer)
        else:
            logger.info("approval: %s approved by user", name)

    # ── State access ─────────────────────────────────────────────────────────

    def _proposal(self, agent) -> dict:
        if self._read_state is not None:
            return self._read_state(PROPOSAL_KEY) or {}
        if agent is None:
            return {}
        try:
            return agent.state.get(PROPOSAL_KEY) or {}
        except Exception:            # noqa: BLE001 - never let the guard itself throw
            logger.warning("approval: could not read proposal state")
            return {}
