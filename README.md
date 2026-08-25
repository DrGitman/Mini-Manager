# Mini Manager

**An AI agent that keeps your files in order while you work, and only interrupts you
when it genuinely isn't sure.**

Built with the [Strands Agents SDK](https://strandsagents.com). Mini Manager is not an
app you open and drive — it runs on a schedule, decides what it is confident about,
applies those changes itself, and stops to ask you about anything private or uncertain.
You find the work already done, plus a short list of things it wanted an opinion on.

The agent has eleven tools, chains them without being told the order, and every change it
makes passes through a deterministic safety kernel it cannot reason its way around.

---

## Project Overview

Most file organisers ask you to write rules. Mini Manager reads the folder instead, works
out what each file is, and decides — per file — whether it should act or ask.

That decision is the product. A confidence score is not a badge on a list here; it is the
threshold at which a human gets interrupted. Above it the agent applies the change and
tells you afterwards. Below it, or on anything that looks private, it stops and explains
itself in its own words:

> *"I left your passport scan alone because it is personal identification and I didn't
> want to risk moving something so private."*

Nothing is ever deleted. There is no code path in the application that removes a file.

---

## How the agent decides

Every file goes through the same routing, and the thresholds are yours to set:

| Confidence | Sensitivity | What happens |
|---|---|---|
| ≥ 0.85 | none | **Applied.** Reported afterwards. |
| 0.70 – 0.85 | none | **Queued for review.** |
| < 0.70 | any | **Escalated.** Waits for you. |
| any | private | **Escalated.** Confidence is irrelevant — a correct guess about someone's passport is still a decision that belongs to them. |

An autonomous run never blocks on an escalation. It records the question, carries on to
the next folder, and the answer waits for you in Notifications.

---

## The tools

The agent is given capabilities and constraints; it decides the sequence. Asked to tidy a
folder, it typically calls six tools unprompted — including reading your rules and past
corrections before proposing anything.

**Observe** — read-only
`scan_folder` · `query_files` · `find_stale` · `check_rules` · `recall_corrections`

**Reason** — produce plans, change nothing
`classify_files` · `check_sensitive` · `propose_changes`

**Act** — every call enters the safety kernel
`apply_changes` · `quarantine` · `notify_user`

---

## Architecture

```mermaid
graph TB
    subgraph Cloud["FastAPI on Render"]
        AGENT["<b>Strands Agent</b><br/>plans · chains tools · escalates"]
        TOOLS["11 tools<br/>observe · reason · act"]
        HOOK["Approval hook<br/><i>should we ask?</i>"]
        KERNEL["<b>Safety kernel</b><br/><i>what is permitted?</i><br/>no delete · blocklist<br/>no overwrite · journal first"]
        AGENT --> TOOLS
        TOOLS --> HOOK
        HOOK --> KERNEL
    end

    subgraph Device["User's machine — Electron"]
        SCAN["Scanner<br/>builds folder digests"]
        EXEC["Executor<br/>runs approved plans"]
        FS[("Filesystem")]
        SCAN --> FS
        EXEC --> FS
    end

    subgraph Model["Model provider"]
        GEM["Google Gemini"]
    end

    subgraph Store["Neon Postgres · S3"]
        DB[("runs · journal · escalations<br/>rules · corrections")]
        S3[("Agent sessions<br/>paused interrupts")]
    end

    SCAN -.->|"digest<br/>(metadata only)"| AGENT
    KERNEL -.->|"validated plan"| EXEC
    AGENT <--> GEM
    AGENT --> DB
    KERNEL --> DB
    AGENT -.-> S3

    style AGENT fill:#dbeafe,stroke:#2563eb,stroke-width:3px
    style KERNEL fill:#fee2e2,stroke:#dc2626,stroke-width:3px
```

**Return-of-control.** The agent reasons on the server; the desktop app executes anything
needing the disk. A hosted backend cannot reach `C:\Users\you\Downloads` and is not meant
to — so the scanner uploads a metadata digest, the agent plans against it, and the kernel
hands back a validated plan for the device to carry out behind its own independent guard.

---

## Safety

Two layers, and the distinction is load-bearing:

**The approval hook decides whether to _ask_.** It is registered, configurable, and
therefore skippable. It may only ever add friction, never grant permission.

**The kernel decides what is _physically permitted_.** It is called unconditionally
inside every acting tool, so a hook that fails to fire cannot produce an unsafe
operation — only an unasked-for one.

The kernel enforces, in this order:

1. **Canonicalise first** — every later check reasons about the resolved path
2. **Blocklist**, on source *and* destination — moving *into* Windows is as bad as out
3. **Scan-root containment**
4. **Extension immutable** — renaming `.pdf` to `.exe` is an attack, not a rename
5. **Never overwrite** — disambiguate with ` (1)`
6. **Path length**, checked last because disambiguation lengthens paths
7. **Journal before execute** — undo exists before the change does

**There is no delete.** Not guarded, not behind a flag — no function in the kernel removes
a file. A test asserts the absence, so it stays true.

---

## What leaves your machine

| | Stays local | Sent to the model | Stored |
|---|---|---|---|
| File contents | Yes | Only on explicit **Explain** | No |
| Text previews (first 400 chars) | — | Plain-text files under 500 KB | No |
| Filenames, sizes, paths | — | Yes, for classification | Against your account |
| `.env`, keys, certificates | **Always** | **Never** | No |

---

## AWS in this architecture

Each AWS service here earns its place by solving a problem the design actually has. None
were added for the logo.

### Strands Agents SDK — the agent itself

AWS's open-source agent framework is not a wrapper around this application; it *is* the
application's control flow. The SDK provides:

- **The agent loop.** Tool selection is the model's decision, not a dispatch table we
  wrote. Given "tidy up my Downloads", the agent chains six tools unprompted — including
  reading the user's rules and past corrections before proposing anything. We specify
  capabilities and constraints; it decides sequence.
- **Tool definitions as prompts.** The `@tool` decorator derives each tool's schema from
  its docstring and type hints, which makes those docstrings prompt engineering rather
  than commentary. They are written as instructions to a model.
- **Lifecycle hooks.** `BeforeToolCallEvent` is where the approval layer lives — it
  inspects every mutating call before it executes and decides whether a human is asked.
- **Interrupts.** `event.interrupt()` genuinely pauses the agent mid-tool-call. The user's
  answer resumes it from that point rather than restarting the goal, which is what makes
  human-in-the-loop a first-class path here rather than a retry.
- **Streaming.** `stream_async` emits `current_tool_use` as tools actually execute, so the
  interface shows real work rather than narration.

### Amazon S3 — what makes autonomy survive reality

This is the least glamorous integration and the one the product would break without.

An escalation raised by a scheduled run has nobody watching it. The agent pauses, and that
paused state has to outlive the process — Render recycles containers on every deploy, and
its filesystem is ephemeral. Without durable session storage, an autonomous run that
stopped to ask a question would **silently never resume**: no error, no log, just a
decision nobody is ever offered.

`S3SessionManager` holds the conversation, agent state, and interrupt state. Proven across
a real process boundary: one Python process runs the chain, hits three private files, is
interrupted, and exits. A **separate interpreter**, given only the session id and interrupt
id — and deliberately *not* given the folder digest — restores 16 messages and the
four-file proposal from S3, answers the interrupt, and continues from the paused tool call.

A misconfigured S3 backend is a **startup failure**, not a fallback to local files. Falling
back would pass every test and fail only in production, months later, invisibly.

### Amazon Bedrock and AgentCore — evaluated, not adopted

Both were researched before building, and the honest outcome is worth recording.

**Bedrock** is Strands' default provider and remains the intended fallback. Gemini is
primary today because a working single-provider loop beats a flaky two-provider one on a
four-week timeline.

**AgentCore Runtime** was evaluated and deliberately not used. A cloud runtime cannot reach
`C:\Users\you\Downloads`, and this agent's entire purpose is acting on a user's local
files. The return-of-control split — server reasons, device executes — is the architecture
that constraint forces, and it is the right answer regardless of where the reasoning half
is hosted.

---

## Challenges

### A safety guarantee that depended on the agent's execution order

The most consequential bug in the build, and it looked like a UI failure.

A scheduled run classified `passport_scan.jpg` at **0.97 confidence** and marked it
`auto` — queued to be moved automatically. The rule "anything private always goes to a
human" had been enforced in `propose_changes`, which read the sensitivity that
`check_sensitive` had recorded. But the agent chooses its own tool sequence, and on that
run it went straight from `classify_files` to `propose_changes` and never called
`check_sensitive` at all. No sensitivity was recorded, high confidence carried the file,
and it was routed for automatic action.

Nothing errored. The tests were green. The guarantee simply did not hold, because it
depended on a model remembering a step.

**The fix moves the check to a layer that cannot be skipped.** `propose_changes` now
re-derives sensitivity itself, deterministically, from the filename — and still honours
the recorded value when it is stricter, since `check_sensitive` can identify things a
filename cannot. The agent's cooperation is no longer part of the safety argument.

This is the same reasoning the kernel exists for, discovered one layer above it: *a
protection that only holds when an earlier step remembers to run is not a protection.*

**The fix is tested in both directions.** It would have been trivial to make this safe and
useless by escalating everything — so the suite also asserts that ordinary confident files
are still applied automatically. A guard that stops all work is not a safe guard, it is a
broken one.

### A server planning file moves for a machine it cannot see

Two bugs of the same family, both invisible locally and both found by deploying.

`Path.resolve()` consults the filesystem it is running on. Validating a Windows path on a
Linux container, it treated `D:\Sandbox\Downloads\notes.txt` as *relative* and rebased it —
approving a move to `/opt/render/project/src/Documents/notes.txt`. A real destination, on
entirely the wrong machine. Canonicalisation is now purely lexical, choosing Windows or
POSIX semantics from the *shape of the path* rather than the host OS.

Then the same class one layer up: `pathlib.Path` on Linux treats a Windows path as one
long filename, so `.parent` is `.` and joining produced a bare relative path. Both passed
every local test, because Windows paths behave plausibly on Windows.

### Testing for the absence of a symptom

A recurring self-inflicted one, worth recording. After fixing the path bug, the suite went
green while the output was still wrong — the assertion checked that the bad prefix was
*gone*, and it was; the path was merely relative instead. The lesson, applied since:
**assert that the right thing is present, not that a wrong thing is absent.**

---

## Testing

```bash
backend/api/.venv/Scripts/python.exe -m pytest backend/api/tests -q
```

**46 backend tests** covering the kernel's guarantees, characterisation tests written
against the pre-refactor implementation to prove the extraction preserved behaviour, and
the sensitivity independence above.

Behaviour is also verified end to end through Chrome DevTools Protocol against the running
Electron app — a real agent run, a real escalation, and every action clicked, with counts
read back from the API rather than the screen.

---

## Project Layout

```
mini-manager-app/
|-- backend/api/
|   |-- services/
|   |   |-- kernel.py             the safety kernel — every mutation passes here
|   |   |-- agent_tools.py        the 11 tools, with docstrings written as prompts
|   |   |-- autonomous.py         scheduled runs; never blocks on a question
|   |   |-- approval.py           the hook that decides whether to ask
|   |   +-- sessions.py           where a paused agent waits (S3 in production)
|   |-- routers/
|   |   |-- agent_v2.py           the Strands agent, streaming over SSE
|   |   +-- runs.py               scheduling, escalations, run summaries
|   +-- tests/
|-- app/                          Next.js App Router
|   |-- (app)/overview            run summaries — what happened while you were away
|   |-- (app)/notifications       escalations, answered inline
|   +-- (app)/organize            scan and review
|-- components/layout/
|   |-- ai-panel.tsx              chat, streaming real tool calls
|   +-- run-summary.tsx           the agent's account of its own run
|-- lib/
|   |-- agent-stream.ts           SSE client
|   |-- folder-digests.ts         the metadata the agent reasons over
|   +-- scheduler.ts              asks the server whether a run is owed
+-- electron/
    +-- main.js                   filesystem access, executor, notifications
```

---

## Run

Node 20+, pnpm, Python 3.13, and a PostgreSQL database.

**Use pnpm, not npm** — the dependency tree is symlinked and npm's resolver fails on it.

```bash
pnpm install
python -m venv backend/api/.venv
backend/api/.venv/Scripts/python.exe -m pip install -r backend/api/requirements.txt

# configure backend/api/.env and .env.local — see below

pnpm dev:all          # frontend on :3000, API on :8000
pnpm electron:dev     # desktop app
pnpm electron:build   # Windows installer → dist-electron/
```

Migrations run automatically on backend startup. Building the installer needs Windows
Developer Mode enabled, or an administrator terminal.

---

## Configuration

`backend/api/.env`:

| Name | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Signs login tokens | Yes |
| `GEMINI_API_KEY` | The agent's model | Yes |
| `GEMINI_MODEL` | Defaults to `gemini-flash-lite-latest` | No |
| `SESSION_BACKEND` | `file` or `s3` — **must be `s3` in production** | No |
| `SESSION_S3_BUCKET` / `SESSION_S3_REGION` | Where paused agents wait | If s3 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Access to that bucket | If s3 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in | Optional |

Render's filesystem is ephemeral, so file-based sessions there lose any interrupt waiting
on a user at the next deploy. A misconfigured S3 backend fails at startup rather than
quietly falling back — that failure is invisible otherwise, and the only symptom would be
escalated runs that silently never resume.

---

## Built With

**AWS**

- **[Strands Agents SDK](https://strandsagents.com)** — the agent loop, tool calling,
  lifecycle hooks, interrupts, and streaming. The control flow of the application.
- **Amazon S3** — durable agent sessions, so an escalation raised by an unattended run
  survives a deploy and can still be answered.
- **Amazon Bedrock** — the intended fallback provider (see above).

**Everything else**

- **Google Gemini** — the agent's reasoning model
- **FastAPI** · **Neon Postgres** · **Next.js** · **Electron** · **Tailwind**

---

## Notes for anyone working on this

- **Model IDs live in `config.py`**, never inline
- **Migrations re-run on every startup** — they must be idempotent
- **`fork()` in Electron re-launches Electron, not Node** — the child needs
  `ELECTRON_RUN_AS_NODE=1` or it boots as a second copy of the app and quits
- **Scan scope comes only from folders the user adds** — never derive a home directory
  from an account's display name
- **JSONB arrives as text** — parse every such column, not just the one that crashed first

---

## Pre-existing work


Development on this repository began on **6 August 2026**. The file scanner, classification
pipeline, undo journal, authentication and user interface were built between 6 and 18
August 2026 — the first four days of which fall before the submission period opened on
10 August.

Work carried out during the submission period covers the Strands Agents integration: the
agent loop and its tool layer, the safety kernel extraction, the human-in-the-loop
escalation path, autonomous scheduled runs, and the streaming interface. The file engine
that predates it is infrastructure the agent operates rather than part of the agent
itself.

---

## License

MIT. See [LICENSE](LICENSE).
