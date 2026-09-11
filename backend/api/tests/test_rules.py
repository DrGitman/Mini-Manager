"""
Rules that deterministic code acts on.

Filing rules can be vague because a model reads them at the moment they matter.
Schedule and notify rules cannot: `/runs/due` is arithmetic on timestamps and
the mailer is an SMTP call, and neither has anything in the loop that could
interpret an ambiguous sentence. So the compiled forms are tested here.

The case that motivated most of this file is `test_a_days_only_rule_keeps_its_days`.
"Only run at weekends" originally compiled to a schedule with no interval and no
clock time, which was treated as an error, which fell back to the six-hourly
default — and the default has no day restriction, so the agent ran on Monday for
someone who had asked it not to. The rule appeared in their list looking fine.
That is the failure this module exists to prevent: not a crash, but a rule that
silently does nothing while the user stops worrying about it.
"""
from __future__ import annotations

import pathlib
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3]))

from backend.api.services import rules as R


def rule(body: dict) -> dict:
    """A stored rule row, as the loader returns it."""
    return {"compiled": body, "rule_text": body.get("description", ""), "source": "stated"}


MONDAY_0800 = datetime(2026, 9, 14, 8, 0, tzinfo=timezone.utc)


# ─── Schedules ────────────────────────────────────────────────────────────────

def test_no_rules_keeps_the_six_hourly_default():
    """Existing users must be unaffected by the feature existing."""
    nxt, why = R.next_due_at([], last_run=MONDAY_0800, now=MONDAY_0800)
    assert nxt == MONDAY_0800 + timedelta(hours=6)
    assert "6 hours" in why


def test_an_interval_rule_sets_the_interval():
    r = rule(R._schedule(every_minutes=120, description="Run every 2 hours."))
    nxt, _ = R.next_due_at([r], last_run=MONDAY_0800, now=MONDAY_0800)
    assert nxt == MONDAY_0800 + timedelta(hours=2)


def test_a_days_only_rule_keeps_its_days():
    """
    "Only run at weekends" must not decay into "run whenever".

    The next run has to land on a Saturday or Sunday. Asserting the weekday is
    the point — asserting merely that it differs from the default would have
    passed while the rule was being ignored.
    """
    body = R._sanitise({"kind": "schedule", "every_minutes": None,
                        "at_times": [], "days": [5, 6],
                        "description": "Run only at weekends."})
    assert not body.get("error"), "a days-only schedule is complete, not broken"

    nxt, _ = R.next_due_at([rule(body)], last_run=MONDAY_0800, now=MONDAY_0800)
    assert nxt.weekday() in (5, 6), f"landed on {nxt:%A}, which is not a weekend"


def test_weekday_rule_never_lands_on_a_weekend():
    body = R._sanitise({"kind": "schedule", "every_minutes": None,
                        "at_times": ["09:00"], "days": [0, 1, 2, 3, 4],
                        "description": "Weekdays at 9."})
    friday_evening = datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc)
    nxt, _ = R.next_due_at([rule(body)], last_run=friday_evening, now=friday_evening)
    assert nxt.weekday() < 5, f"landed on {nxt:%A}"
    assert (nxt.hour, nxt.minute) == (9, 0)


def test_the_earliest_of_several_rules_wins():
    """Two schedules is not a conflict — the user wants whichever comes first."""
    every_six = rule(R._schedule(every_minutes=360, description="Every 6 hours."))
    at_nine = rule(R._schedule(every_minutes=None, at_times=["09:00"],
                               description="At 09:00."))
    nxt, _ = R.next_due_at([every_six, at_nine], last_run=MONDAY_0800, now=MONDAY_0800)
    assert nxt == MONDAY_0800.replace(hour=9), "the 09:00 rule is an hour away and should win"


def test_intervals_are_floored_not_obeyed_literally():
    """"Scan every minute" must not mean a full agent run every minute."""
    body = R._sanitise({"kind": "schedule", "every_minutes": 1, "at_times": [],
                        "days": [0, 1, 2, 3, 4, 5, 6], "description": "x"})
    assert body["every_minutes"] == R.MIN_INTERVAL_MINUTES


def test_a_broken_schedule_is_ignored_rather_than_guessed_at():
    body = R._sanitise({"kind": "schedule", "every_minutes": None, "at_times": [],
                        "days": [0, 1, 2, 3, 4, 5, 6], "description": "x"})
    assert body.get("error"), "a schedule with no interval, time or day limit is not usable"
    nxt, why = R.next_due_at([rule(body)], last_run=MONDAY_0800, now=MONDAY_0800)
    assert nxt == MONDAY_0800 + timedelta(hours=6) and "default" in why


# ─── Notifications ────────────────────────────────────────────────────────────

def test_silence_is_the_default():
    """No rule means no email. An unrequested email is the thing to avoid."""
    plan = R.notify_plan([], "me@example.com", files_applied=5, escalations=2)
    assert plan["send"] is False


def test_an_always_rule_sends_and_falls_back_to_the_account_address():
    body = {"kind": "notify", "channel": "email", "when": "always",
            "address": None, "digest": False, "description": "Email me."}
    plan = R.notify_plan([rule(body)], "me@example.com", 3, 0)
    assert plan["send"] is True
    assert plan["address"] == "me@example.com"


def test_escalations_only_stays_quiet_when_nothing_needs_deciding():
    body = {"kind": "notify", "channel": "email", "when": "escalations_only",
            "address": None, "digest": False, "description": "Only when you need me."}
    assert R.notify_plan([rule(body)], "me@example.com", 9, 0)["send"] is False
    assert R.notify_plan([rule(body)], "me@example.com", 0, 1)["send"] is True


def test_changes_only_stays_quiet_when_nothing_moved():
    body = {"kind": "notify", "channel": "email", "when": "changes_only",
            "address": None, "digest": False, "description": "Only if you moved something."}
    assert R.notify_plan([rule(body)], "me@example.com", 0, 3)["send"] is False
    assert R.notify_plan([rule(body)], "me@example.com", 2, 0)["send"] is True


def test_a_named_address_overrides_the_account_one():
    body = {"kind": "notify", "channel": "email", "when": "always",
            "address": "other@example.com", "digest": False, "description": "x"}
    assert R.notify_plan([rule(body)], "me@example.com", 1, 0)["address"] == "other@example.com"


def test_never_wins_over_any_other_notify_rule():
    """A later "stop emailing me" must not be outvoted by an earlier "email me"."""
    yes = {"kind": "notify", "channel": "email", "when": "always",
           "address": None, "digest": False, "description": "Email me."}
    no = {"kind": "notify", "channel": "none", "when": "never",
          "address": None, "digest": False, "description": "Do not notify me."}
    assert R.notify_plan([rule(yes), rule(no)], "me@example.com", 5, 5)["send"] is False


# ─── Autonomy ─────────────────────────────────────────────────────────────────

BASE_PREFS = {"auto_threshold": 0.85, "review_threshold": 0.70}


def test_prefs_are_untouched_without_an_autonomy_rule():
    assert R.autonomy_overrides([], BASE_PREFS) == BASE_PREFS


def test_a_rule_outranks_the_settings_slider():
    body = {"kind": "autonomy", "auto_threshold": 0.95, "review_threshold": None,
            "always_ask": False, "scope_folder": None, "description": "x"}
    assert R.autonomy_overrides([rule(body)], BASE_PREFS)["auto_threshold"] == 0.95


def test_always_ask_makes_every_file_reach_the_user():
    """
    Expressed as a threshold above 1.0 so no confidence can clear it.

    Checked against the real maximum a classifier can return rather than a
    token value — 1.0 must not squeak through.
    """
    body = {"kind": "autonomy", "auto_threshold": None, "review_threshold": None,
            "always_ask": True, "scope_folder": None, "description": "Always ask."}
    merged = R.autonomy_overrides([rule(body)], BASE_PREFS)
    assert 1.0 < merged["auto_threshold"]
    assert 1.0 < merged["review_threshold"]


def test_thresholds_from_a_model_are_clamped_to_a_real_range():
    body = R._sanitise({"kind": "autonomy", "auto_threshold": 4.0,
                        "review_threshold": -2.0, "always_ask": False})
    assert body["auto_threshold"] == 1.0
    assert body["review_threshold"] == 0.0


# ─── Protection and sensitivity ───────────────────────────────────────────────

def test_protect_rules_become_kernel_blocklist_entries():
    """
    A protect rule goes to the kernel, not the approval hook.

    The hook decides whether to ask; the kernel decides what is permitted.
    "Never touch my Projects folder" means never, so it belongs in the layer
    that cannot be talked round.
    """
    body = {"kind": "protect", "paths": ["D:\\Projects"], "name_contains": [],
            "extensions": [], "description": "x"}
    assert R.blocklist_entries([rule(body)]) == ["D:\\Projects"]


def test_sensitivity_can_be_widened():
    body = {"kind": "sensitivity",
            "treat_as_private": {"folders": ["Contracts"], "name_contains": [], "extensions": []},
            "not_private": {"name_contains": []}, "description": "x"}
    out = R.sensitivity_overrides([rule(body)])
    assert "contracts" in out["private_folders"]


def test_narrowing_sensitivity_is_limited_to_what_the_user_named():
    """
    "Stop flagging receipts" must not become "stop flagging anything".

    Widening is safe — it only sends more to a human. Narrowing makes the agent
    act on something it would have asked about, so it stays an explicit list.
    """
    body = {"kind": "sensitivity",
            "treat_as_private": {"folders": [], "name_contains": [], "extensions": []},
            "not_private": {"name_contains": ["receipt"]}, "description": "x"}
    out = R.sensitivity_overrides([rule(body)])
    assert out["not_private_name_contains"] == ["receipt"]
    assert out["private_folders"] == [] and out["private_name_contains"] == []


def test_retention_can_never_compile_to_a_delete():
    """There is no delete anywhere, and a retention rule is not a way in."""
    for asked in ("delete", "destroy", "shred", "remove", None, 123):
        body = R._sanitise({"kind": "retention", "older_than_days": 30, "action": asked})
        assert body["action"] in ("archive", "quarantine", "flag"), asked


# ─── What the agent is told ───────────────────────────────────────────────────

def test_broken_rules_are_shown_to_the_agent_as_broken():
    """
    The agent mentioning a rule does not work beats everyone ignoring it.

    A rule sitting in the list looking healthy while nothing acts on it is how
    a user stops checking something that was never handled.
    """
    good = rule({"kind": "filing", "description": "File invoices in Finance."})
    bad = rule({"kind": "filing", "description": "", "error": "This does not read as a rule."})
    described = R.describe_for_agent([good, bad])
    assert described[0]["broken"] is False
    assert described[1]["broken"] is True and described[1]["problem"]


def test_jsonb_arriving_as_text_is_still_parsed():
    """asyncpg hands back JSONB as a string, and this has bitten the app twice."""
    import json
    as_text = {"compiled": json.dumps(
        R._schedule(every_minutes=90, description="Every 90 minutes.")), "rule_text": "x"}
    nxt, _ = R.next_due_at([as_text], last_run=MONDAY_0800, now=MONDAY_0800)
    assert nxt == MONDAY_0800 + timedelta(minutes=90)
