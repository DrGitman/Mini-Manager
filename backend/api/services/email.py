"""
Outbound email.

The agent works while nobody is watching, so the only way it can reach someone
who is not at their desk is email. This is that channel, and nothing more: it
sends a message and says whether it went.

Three rules shape the whole module.

**It never raises into a run.** A run that organised forty files and then failed
to send a summary is a successful run with a missing email, not a failed run.
Every entry point returns a bool and swallows its own errors. The alternative —
an SMTP timeout rolling back real filing work — is absurd.

**It never blocks the event loop.** `smtplib` is synchronous and a slow or dead
SMTP host will sit there for the full timeout. On an async server that stalls
every other request, so the blocking call goes to a worker thread.

**Unconfigured is not an error.** Email is opt-in. With no `SMTP_HOST` the
sender reports that it is disabled and returns False, which is different from
trying and failing, and the caller can tell the two apart.
"""

from __future__ import annotations

import asyncio
import logging
import re
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

from ..config import settings

logger = logging.getLogger(__name__)

# Generous enough for a cold SMTP sandbox, short enough that a dead host does
# not hold a worker thread for a minute.
SMTP_TIMEOUT = 20.0

# Sandbox tiers throttle aggressively — Mailtrap returns 550 "Too many emails
# per second" for the second message in a burst. That reads as a permanent
# failure by its code but is entirely transient, so it is worth two backed-off
# retries. A run that sends a digest and an alert together hits this every time.
RATE_LIMIT_RETRIES = 2


def _is_rate_limit(exc: Exception) -> bool:
    """Whether a refusal is throttling rather than rejection."""
    text = str(exc).lower()
    return any(s in text for s in (
        "too many", "rate limit", "throttl", "try again later", "4.7.0",
    ))


@dataclass
class SendResult:
    """
    What happened, in enough detail to tell a user something useful.

    `disabled` separates "there is no mail server configured" from "we tried and
    it failed" — the first is a settings problem the user can fix, the second is
    an outage they cannot.
    """
    ok: bool
    disabled: bool = False
    error: str = ""

    def __bool__(self) -> bool:
        return self.ok


def is_configured() -> bool:
    """True when there is somewhere to send mail."""
    return bool((settings.smtp_host or "").strip())


def _valid_address(addr: str) -> bool:
    """
    A deliberately loose check — just enough to refuse obvious nonsense.

    Strict RFC 5322 validation rejects addresses that work in practice, so this
    only catches the cases that would certainly bounce: no @, no domain dot,
    or embedded whitespace and newlines. The newline case matters most — a
    header injection would otherwise let a crafted address add its own headers.
    """
    _, email = parseaddr(addr or "")
    if not email or any(c in email for c in "\r\n \t"):
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def _build(to: str, subject: str, html: str, text: str) -> EmailMessage:
    """
    A multipart/alternative message.

    The plain-text part is not decoration. Some clients render it by preference,
    screen readers do better with it, and a message with no text alternative
    scores worse with spam filters — which matters the day this points at SES
    rather than a sandbox.
    """
    msg = EmailMessage()
    msg["Subject"] = subject.replace("\n", " ").replace("\r", " ")[:200]

    name, addr = parseaddr(settings.smtp_from)
    msg["From"] = formataddr((name, addr)) if name else addr
    msg["To"] = to
    msg["Auto-Submitted"] = "auto-generated"      # stops out-of-office ping-pong

    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


def _send_blocking(msg: EmailMessage) -> None:
    """The synchronous SMTP conversation. Runs in a worker thread."""
    host = settings.smtp_host.strip()
    port = int(settings.smtp_port)

    with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT) as server:
        if settings.smtp_starttls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def send_email(to: str, subject: str, html: str, text: str = "") -> SendResult:
    """
    Send one message. Never raises.

    Returns a SendResult so a caller that cares can distinguish "no mail server
    configured" from "the server refused it", and a caller that does not care
    can treat it as a bool.
    """
    if not is_configured():
        logger.info("email: not configured, skipping message to %s", to)
        return SendResult(ok=False, disabled=True, error="no SMTP host configured")

    if not _valid_address(to):
        logger.warning("email: refusing to send to malformed address %r", to)
        return SendResult(ok=False, error="the recipient address is not valid")

    msg = _build(to, subject, html, text or _strip_html(html))

    last = ""
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            await asyncio.to_thread(_send_blocking, msg)
        except smtplib.SMTPAuthenticationError as exc:
            logger.error("email: SMTP rejected our credentials: %s", exc)
            return SendResult(ok=False, error="the mail server rejected the credentials")
        except (smtplib.SMTPException, OSError) as exc:
            # OSError covers DNS failure, refused connection and timeout, which
            # are the common ones and are not SMTPExceptions.
            last = str(exc)
            if _is_rate_limit(exc) and attempt < RATE_LIMIT_RETRIES:
                delay = 2 ** attempt
                logger.info("email: throttled, retrying in %ss", delay)
                await asyncio.sleep(delay)
                continue
            logger.warning("email: could not send to %s: %s", to, exc)
            return SendResult(ok=False, error=last)
        else:
            logger.info("email: sent %r to %s", subject[:60], to)
            return SendResult(ok=True)

    return SendResult(ok=False, error=last)


def _strip_html(html: str) -> str:
    """
    A crude HTML-to-text fallback for callers that did not supply one.

    Good enough for our own templates, which are simple and known. It is not a
    general renderer and is not trying to be.
    """
    text = re.sub(r"(?is)<(script|style).*?</\1>", "", html)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|tr|h[1-6]|li)>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()


async def send_test_email(to: str) -> SendResult:
    """
    Prove the mail path works, from the app, to this address.

    Exposed so a user can click "send a test" in Settings rather than write a
    rule, wait six hours, and discover the password was wrong.
    """
    return await send_email(
        to=to,
        subject="Mini Manager — email is working",
        html=render_basic(
            heading="Email is working",
            body=(
                "<p>This is a test message from Mini Manager. If you are reading "
                "it, your agent can reach you here.</p>"
                "<p>Run summaries and decisions will arrive at this address "
                "whenever one of your rules asks for them.</p>"
            ),
        ),
    )


# ─── Templates ────────────────────────────────────────────────────────────────
#
# Inline styles only. Every major mail client strips <style> blocks or ignores
# external CSS, so a stylesheet would render as unstyled text in Gmail.

_WRAP = """\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="max-width:600px;margin:0 auto;padding:24px;
              font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
              color:#1f2430;line-height:1.6;">
    <div style="background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden;">
      <div style="background:#2563eb;color:#ffffff;padding:20px 24px;">
        <div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85;">
          Mini&nbsp;Manager
        </div>
        <div style="font-size:20px;font-weight:600;margin-top:4px;">{heading}</div>
      </div>
      <div style="padding:24px;font-size:15px;">{body}</div>
    </div>
    <div style="text-align:center;color:#8a94a6;font-size:12px;padding:16px 8px;">
      Sent by your Mini Manager agent because one of your rules asked for it.<br>
      Change or remove that rule in Settings &rsaquo; Rules.
    </div>
  </div>
</body>
</html>"""


def render_basic(heading: str, body: str) -> str:
    """Wrap a body fragment in the standard shell."""
    return _WRAP.format(heading=_escape(heading), body=body)


def _escape(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def render_run_digest(
    summary: str,
    files_seen: int,
    files_applied: int,
    escalations: list[dict],
    folders: list[str],
) -> tuple[str, str]:
    """
    The "here is what I did" email. Returns (subject, html).

    Led by the agent's own sentence, for the same reason the in-app card is:
    a person reading prose about their own passport understands it, and a person
    reading "1 applied, 3 skipped" has to work it out and mostly does not.
    """
    if escalations:
        subject = (f"Mini Manager: {len(escalations)} "
                   f"file{'s' if len(escalations) != 1 else ''} need your decision")
    else:
        subject = f"Mini Manager: {files_applied} file{'s' if files_applied != 1 else ''} organised"

    parts = [
        f'<p style="font-size:16px;margin:0 0 20px;">{_escape(summary)}</p>',
        '<table style="width:100%;border-collapse:collapse;margin:0 0 20px;'
        'background:#f8fafc;border-radius:8px;">',
        _row("Folders", ", ".join(folders) or "—"),
        _row("Files looked at", str(files_seen)),
        _row("Organised", str(files_applied)),
        _row("Left for you", str(len(escalations))),
        "</table>",
    ]

    if escalations:
        parts.append(
            '<div style="font-size:13px;font-weight:600;text-transform:uppercase;'
            'letter-spacing:1px;color:#8a94a6;margin:0 0 10px;">Waiting on you</div>'
        )
        for e in escalations[:12]:
            note = e.get("agent_note") or e.get("why") or "Needs a decision."
            parts.append(
                '<div style="border-left:3px solid #f59e0b;background:#fffbeb;'
                'padding:12px 14px;margin:0 0 10px;border-radius:0 6px 6px 0;">'
                f'<div style="font-weight:600;">{_escape(e.get("file") or "A file")}</div>'
                f'<div style="color:#5b6472;font-size:14px;margin-top:2px;">{_escape(note)}</div>'
                "</div>"
            )
        if len(escalations) > 12:
            parts.append(
                f'<p style="color:#8a94a6;font-size:13px;">'
                f"…and {len(escalations) - 12} more.</p>"
            )
        parts.append(
            '<p style="margin-top:20px;">Open Mini Manager to decide on these. '
            "Nothing has been moved.</p>"
        )

    return subject, render_basic("While you were away", "".join(parts))


def _row(label: str, value: str) -> str:
    return (
        '<tr>'
        f'<td style="padding:8px 14px;color:#8a94a6;font-size:13px;width:45%;">{_escape(label)}</td>'
        f'<td style="padding:8px 14px;font-weight:600;font-size:14px;">{_escape(value)}</td>'
        "</tr>"
    )
