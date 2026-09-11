"""
The public guest demo.

Anyone can open the demo with no account. It runs the *real* agent against a
sample folder, so a judge sees actual tool calls, actual confidence scores and
an actual escalation rather than a recording.

Running the real agent is also why the limit is enforced here and not in the
browser. Every action spends Gemini and Groq credits on an endpoint that is
unauthenticated by design, and a localStorage counter is one DevTools edit away
from unlimited. The ledger lives in Postgres, keyed to a signed token.

Two limits, doing different jobs:

**Actions per session** is the product rule — a fixed number of things, then
the demo is over. It exists so the demo stays a demo.

**Actions per IP per day** is the abuse rule, and it is the one that makes the
first limit mean anything. Capping sessions alone fails: a session costs nothing
until it is spent, so anyone could open several and drain each in turn.

A demo token is a normal JWT carrying `demo: true`, so every existing endpoint
keeps working unchanged. What it cannot do is anything tied to a real account:
there is no user row behind it, so profile, preferences and journal reads
return nothing rather than someone else's data.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from .._jwt import create_token
from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["demo"])

# Eight actions. Enough to scan, watch it classify, see an escalation, answer
# it, ask a few follow-up questions, and still have room to poke at something
# unexpected — which is what a judge actually does before deciding.
DEMO_ACTION_LIMIT = 8

# A session lives two hours. Long enough that nobody is timed out mid-look,
# short enough that a leaked token is not a standing invitation.
DEMO_TOKEN_HOURS = 2

# Session spam guard. Stops one visitor opening hundreds of rows even if each
# one goes unused.
MAX_SESSIONS_PER_IP_PER_HOUR = 6

# The real limit, and the one that makes the per-session cap mean anything.
#
# Capping sessions alone does not work: a session is free until it is spent, so
# anyone could open several while the day's count is still zero and drain each
# in turn. Budgeting *actions* per address means the demo is one allowance per
# person per day however many times they reload.
#
# The trade-off is shared addresses. An office, a university or a phone network
# puts many people behind one IP, so a second visitor from the same network can
# find the demo already spent. That is deliberate — abuse costs real model
# credits on an endpoint with no account behind it — but if someone reports
# being blocked unfairly, this number is the dial. Raising it to 24 gives about
# three people per network per day.
MAX_ACTIONS_PER_IP_PER_DAY = 8

# What counts as an action. The user's rule: anything that is core product
# behaviour. Naming them explicitly keeps the ledger readable later.
ACTION_KINDS = {"scan", "chat", "apply", "undo", "correction", "escalation"}


def client_ip(request: Request) -> str:
    """
    The caller's address, honouring the proxy header Render sets.

    Takes the first entry of X-Forwarded-For: the chain is client, then each
    proxy, so the last entry is our own infrastructure and would bucket every
    visitor together.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_demo(payload: dict) -> bool:
    return bool(payload.get("demo"))


async def demo_session_id(payload: dict) -> Optional[str]:
    """
    The demo_sessions row behind this token, if it is a guest.

    Looked up by user_id rather than encoded in `sub`. `sub` has to be a plain
    user UUID because the rest of the application uses it as one directly in
    SQL — an earlier version prefixed it with "demo:" and every user-scoped
    endpoint returned 500 for guests.
    """
    if not is_demo(payload):
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    pool = get_pool()
    return await pool.fetchval(
        """
        SELECT id::text FROM demo_sessions
        WHERE user_id = $1::uuid
        ORDER BY created_at DESC LIMIT 1
        """,
        user_id,
    )


# ─── Responses ────────────────────────────────────────────────────────────────

class DemoSession(BaseModel):
    token: str
    session_id: str
    actions_used: int
    actions_left: int
    limit: int


class DemoState(BaseModel):
    actions_used: int
    actions_left: int
    limit: int
    exhausted: bool


class ActionRequest(BaseModel):
    kind: str = "scan"


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/demo/session", response_model=DemoSession)
async def start_demo(request: Request) -> DemoSession:
    """
    Begin a guest session. No account, no email, no cookie banner.

    Rate limited per IP, because the action limit is meaningless if a fresh
    allowance is one page reload away.
    """
    pool = get_pool()
    ip = client_ip(request)

    # Retire guest accounts older than a day.
    #
    # Every demo visit creates a real users row, which is what lets a guest be
    # an ordinary user everywhere downstream — but it also means the table grows
    # by one per visitor and never shrinks. Cleaning up here rather than on a
    # schedule keeps it to one statement with no extra infrastructure, and the
    # rows are disposable by construction: the token expires in two hours, so
    # anything a day old is certainly finished with.
    #
    # Failure is ignored on purpose. Housekeeping must never stop someone
    # starting the demo.
    try:
        removed = await pool.execute(
            """
            DELETE FROM users
            WHERE email LIKE '%@demo.invalid'
              AND created_at < NOW() - INTERVAL '24 hours'
            """
        )
        if removed and removed != "DELETE 0":
            logger.info("demo: cleaned up expired guests (%s)", removed)
    except Exception as exc:                     # noqa: BLE001 - never block a visitor
        logger.warning("demo: guest cleanup skipped: %s", exc)

    # Actions already spent from this address today, across every session it has
    # opened. This is what stops a fresh allowance being one reload away.
    spent_today = await pool.fetchval(
        """
        SELECT COALESCE(SUM(actions_used), 0) FROM demo_sessions
        WHERE ip = $1 AND created_at > NOW() - INTERVAL '24 hours'
        """,
        ip,
    )
    if spent_today and spent_today >= MAX_ACTIONS_PER_IP_PER_DAY:
        logger.info("demo: %s has spent %s actions today, refusing", ip, spent_today)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "The demo has already been used from this network today. "
                "It resets after 24 hours — or read the code on GitHub to see "
                "exactly how the agent works."
            ),
        )

    recent = await pool.fetchval(
        """
        SELECT count(*) FROM demo_sessions
        WHERE ip = $1 AND created_at > NOW() - INTERVAL '1 hour'
        """,
        ip,
    )
    if recent and recent >= MAX_SESSIONS_PER_IP_PER_HOUR:
        logger.info("demo: rate limiting %s (%s sessions this hour)", ip, recent)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "The demo has been started several times from this network "
                "recently. Please try again a little later."
            ),
        )

    # A real account, so the guest is an ordinary user everywhere downstream.
    # The password hash cannot be produced by any password — these exist to be
    # referenced by foreign keys, never signed into.
    guest = await pool.fetchrow(
        """
        INSERT INTO users (email, name, password_hash, plan)
        VALUES ($1, 'Guest', '!demo-no-login', 'free')
        RETURNING id::text, email
        """,
        f"guest-{uuid.uuid4().hex[:12]}@demo.invalid",
    )

    row = await pool.fetchrow(
        """
        INSERT INTO demo_sessions (ip, user_agent, user_id)
        VALUES ($1, $2, $3::uuid)
        RETURNING id::text, actions_used
        """,
        ip, (request.headers.get("user-agent") or "")[:300], guest["id"],
    )

    token = create_token(
        {"sub": guest["id"], "demo": True, "email": guest["email"]},
        expiry_hours=DEMO_TOKEN_HOURS,
    )
    logger.info("demo: session %s started from %s", row["id"][:8], ip)

    return DemoSession(
        token=token,
        session_id=row["id"],
        actions_used=row["actions_used"],
        actions_left=DEMO_ACTION_LIMIT - row["actions_used"],
        limit=DEMO_ACTION_LIMIT,
    )


@router.get("/demo/state", response_model=DemoState)
async def demo_state(user: dict = Depends(get_current_user)) -> DemoState:
    """How much of the demo is left. Returns the truth, not the browser's copy."""
    sid = await demo_session_id(user)
    if sid is None:
        raise HTTPException(status_code=400, detail="Not a demo session")

    used = await pool_actions_used(sid)
    return DemoState(
        actions_used=used,
        actions_left=max(0, DEMO_ACTION_LIMIT - used),
        limit=DEMO_ACTION_LIMIT,
        exhausted=used >= DEMO_ACTION_LIMIT,
    )


@router.post("/demo/action", response_model=DemoState)
async def spend_action(
    body: ActionRequest,
    user: dict = Depends(get_current_user),
) -> DemoState:
    """
    Spend one action.

    For the parts of the demo that never reach the agent — applying a proposal,
    undoing it, correcting a classification. Agent turns consume their action
    inside the agent route instead, so nothing is counted twice.
    """
    sid = await demo_session_id(user)
    if sid is None:
        raise HTTPException(status_code=400, detail="Not a demo session")

    used = await consume_action(sid, body.kind)
    return DemoState(
        actions_used=used,
        actions_left=max(0, DEMO_ACTION_LIMIT - used),
        limit=DEMO_ACTION_LIMIT,
        exhausted=used >= DEMO_ACTION_LIMIT,
    )


# ─── The ledger ───────────────────────────────────────────────────────────────

async def pool_actions_used(session_id: str) -> int:
    pool = get_pool()
    used = await pool.fetchval(
        "SELECT actions_used FROM demo_sessions WHERE id = $1::uuid", session_id
    )
    if used is None:
        raise HTTPException(status_code=404, detail="This demo session has expired.")
    return int(used)


async def consume_action(session_id: str, kind: str) -> int:
    """
    Atomically spend one action, or refuse.

    The increment and the limit check are one statement on purpose. Reading the
    count, deciding, then writing would let two requests in flight both see four
    used and both proceed — which on a public endpoint is not a race you win by
    hoping.

    Returns the new total. Raises 402 when the demo is spent, which the frontend
    turns into the "that's the demo" screen.
    """
    if kind not in ACTION_KINDS:
        kind = "other"

    pool = get_pool()

    # The per-address budget is checked here as well as at session creation,
    # because checking only at creation leaves an obvious hole: open six empty
    # sessions while the day's count is still zero, then spend five in each.
    # Every session passes the gate on the way in and thirty actions get spent.
    # Enforcing it at the moment of spending closes that.
    over_budget = await pool.fetchval(
        """
        SELECT COALESCE(SUM(d.actions_used), 0) >= $2
          FROM demo_sessions d
         WHERE d.ip = (SELECT ip FROM demo_sessions WHERE id = $1::uuid)
           AND d.created_at > NOW() - INTERVAL '24 hours'
        """,
        session_id, MAX_ACTIONS_PER_IP_PER_DAY,
    )
    if over_budget:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"That is all {DEMO_ACTION_LIMIT} demo actions for this network today. "
                "The full agent runs on your own folders in the desktop app."
            ),
        )

    row = await pool.fetchrow(
        """
        UPDATE demo_sessions
           SET actions_used   = actions_used + 1,
               last_action_at = NOW(),
               actions        = actions || $2::jsonb
         WHERE id = $1::uuid
           AND actions_used < $3
        RETURNING actions_used
        """,
        session_id,
        json.dumps([{"kind": kind, "at": datetime.now(timezone.utc).isoformat()}]),
        DEMO_ACTION_LIMIT,
    )

    if row is None:
        # Either the row is gone, or the limit was already reached. Tell those
        # apart so an expired session does not read as an exhausted one.
        exists = await pool.fetchval(
            "SELECT actions_used FROM demo_sessions WHERE id = $1::uuid", session_id
        )
        if exists is None:
            raise HTTPException(status_code=404, detail="This demo session has expired.")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"That is all {DEMO_ACTION_LIMIT} demo actions. "
                "The full agent runs on your own folders in the desktop app."
            ),
        )

    logger.info("demo: session %s spent %s (%s/%s)",
                session_id[:8], kind, row["actions_used"], DEMO_ACTION_LIMIT)
    return int(row["actions_used"])


async def consume_if_demo(user: dict, kind: str) -> None:
    """
    Spend an action when the caller is a guest, and do nothing otherwise.

    Called from the agent route so the limit is enforced where the money is
    actually spent, rather than trusting the client to have asked first.
    """
    sid = await demo_session_id(user)
    if sid is not None:
        await consume_action(sid, kind)
