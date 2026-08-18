# Mini Manager

A desktop file organiser that reads a folder, works out what each file is and where it
belongs, and shows you every proposed change before anything moves. Built for Windows
with Electron, Next.js and FastAPI.

## Project Overview

Most file organisers ask you to write rules. Mini Manager reads the folder instead. It
looks at each file's name, extension, size and date, classifies it with an AI model,
suggests a clearer name and a destination, and attaches a confidence score to every
suggestion so you know which ones deserve a second look.

Nothing happens until you approve it. Every change is written to a journal first, so any
batch can be undone later. The app has no code path that deletes a file — anything you
remove goes to the Recycle Bin or to an Archive folder you can restore from.

The design assumption throughout is that these are the user's own files, and that a
confident wrong answer costs more than an honest "I'm not sure".

## Key Features

- **Folder scanning** — reads name, extension, size and modification date for every file
  in the folders you choose. Nothing outside your scan scope is ever touched.
- **AI classification** — sorts files into categories, proposes a clearer filename and a
  destination folder, and returns a confidence score for each one.
- **Confidence routing** — high-confidence suggestions are pre-selected, uncertain ones
  are surfaced for review. Thresholds are yours to set.
- **Sensitive-file detection** — passports, bank statements and ID scans are flagged and
  bypass the classification cache so they are always reviewed fresh.
- **Learns from corrections** — fix a suggestion once and the correction is fed back into
  later classifications.
- **Plain-English rules** — "put all invoices in Finance/Invoices" is compiled into a
  stored rule and applied on future scans.
- **Full undo journal** — every applied batch is recorded and reversible, per batch or
  per file.
- **Archive, not delete** — files are moved to the Recycle Bin or an Archive folder.
  Permanent deletion happens only when explicitly requested.
- **Blocklist** — system and development folders are refused, on both the server and the
  desktop app.
- **Chat assistant** — ask questions about your files, or instruct changes. Every
  filesystem change it proposes is shown for approval before it runs.

## How Changes Are Kept Safe

The safety behaviour is the part worth understanding before running it on real folders.

- **Approval before execution.** The assistant never applies a change on its own. It
  produces a plan, the plan is displayed in plain English, and nothing touches the disk
  until you press Apply.
- **Journal before execution.** Operations are recorded before they run, so undo exists
  before the change does.
- **No overwrite.** A move onto an existing filename is disambiguated rather than
  replacing it.
- **Protected paths.** System directories and development folders are refused by both the
  backend and the Electron process. Either guard alone is sufficient.
- **Credential files are never read.** `.env` files, private keys, certificates and
  anything named like a secret are excluded from content previews and never sent to an
  AI provider.

## What Leaves Your Machine

Stated plainly, because it is easy to get wrong in either direction.

| | Stays local | Sent to AI providers | Stored in our database |
|---|---|---|---|
| File contents | Yes | Only on explicit **Explain** | No |
| Text previews (first 400 chars) | — | Yes, for plain-text files under 500 KB | No |
| Filenames, sizes, paths | — | Yes, for classification | Yes, against your account |
| Credential files (`.env`, keys, certs) | Yes | **Never** | No |

Your files are never uploaded. Filenames and sizes are, because that is what the
classifier reads. Everything stored is scoped to your account and removed when you delete
it.

## Architecture

```
Electron (desktop)          Next.js (UI)              FastAPI (backend)
─────────────────           ────────────              ─────────────────
 filesystem access    ◄──►   chat · review    ◄──►     classification
 scanning                     history · rules           rules · corrections
 executes approved ops        settings                  journal · undo
                                                             │
                                                             ▼
                                                   Neon PostgreSQL
                                                             │
                                                             ▼
                                          Google Gemini · Groq (classification)
```

The desktop app owns filesystem access; the backend owns classification and history. The
backend plans, the desktop executes — a hosted server cannot reach your disk, and is not
meant to.

## Project Layout

```
mini-manager-app/
|-- app/                          Next.js App Router
|   |-- (app)/                    signed-in pages
|   |   |-- organize/             scan, review and apply changes
|   |   |-- history/              batches and undo
|   |   |-- quarantine/           archived files and restore
|   |   |-- rules/                plain-English rules
|   |   |-- settings/             scan scope, thresholds, notifications
|   |   +-- profile/              account
|   |-- (auth)/                   login, signup, password reset
|   |-- (legal)/                  privacy, terms, refunds
|   +-- onboarding/               first-run folder picker
|-- components/
|   +-- layout/ai-panel.tsx       chat assistant
|-- lib/
|   |-- api.ts                    backend client
|   |-- folder-digests.ts         per-folder metadata the assistant reads
|   +-- session.ts                session store
|-- electron/
|   |-- main.js                   filesystem IPC, operation executor
|   +-- preload.js                context bridge
|-- backend/api/
|   |-- routers/                  classify, agent, journal, rules, auth, ...
|   |-- services/                 gemini, heuristics, cache, db
|   |-- migrations/               numbered SQL, applied on startup
|   +-- requirements.txt
|-- website/                      Vite marketing site (deployed separately)
+-- electron-builder.yml          desktop packaging
```

## Run

You need Node 20+, pnpm, Python 3.13 and a PostgreSQL database.

**Use pnpm, not npm.** The dependency tree is symlinked and npm's resolver fails on it.

```bash
# 1. Install
pnpm install
python -m venv backend/api/.venv
backend/api/.venv/Scripts/python.exe -m pip install -r backend/api/requirements.txt

# 2. Configure — see the table below
#    backend/api/.env      backend settings
#    .env.local            frontend settings

# 3. Run both
pnpm dev:all
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

Migrations run automatically on backend startup, so the database sets itself up.

**Desktop app:**

```bash
pnpm electron:dev            # development
pnpm electron:build          # build the Windows installer
```

Building the installer needs Windows Developer Mode enabled, or an administrator
terminal — electron-builder creates symlinks. Output lands in `dist-electron/`.

## Configuration

`backend/api/.env`:

| Name | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Long random string that signs login tokens | Yes |
| `GEMINI_API_KEY` | Chat, explanations, classification | Yes |
| `GROQ_API_KEY` | Bulk classification | Yes |
| `GEMINI_MODEL` | Defaults to `gemini-flash-lite-latest` | No |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b` | No |
| `FRONTEND_URL` | Your app's address, for CORS | No |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in | Only for Google login |
| `EXTRA_CORS_ORIGINS` | Additional allowed origins, comma-separated | No |

`.env.local` (frontend):

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend address. Empty means same origin. |

Anything prefixed `NEXT_PUBLIC_` is visible to anyone using the site. Never put a secret
key behind that prefix.

## Notes for Anyone Working on This

- **Model IDs live in `config.py`**, never inline. Both providers have decommissioned
  models mid-project before.
- **Migrations re-run on every startup**, so they must be idempotent. Guard destructive
  statements on the schema change not already being applied.
- **Editing files with PowerShell `Set-Content -Encoding utf8` will corrupt them** — it
  double-encodes and adds a BOM. Use a proper editor.
- **`fork()` in Electron re-launches Electron, not Node.** The child needs
  `ELECTRON_RUN_AS_NODE=1` or it boots as a second copy of the app and quits.
- **The scan scope comes only from folders the user adds.** Never derive a home directory
  from an account's display name — it is almost never the profile folder name.

## Pre-existing Work

Development on this repository began on **6 August 2026**. The file scanner, safety
layer, classification pipeline, undo journal, authentication and user interface were
built between 6 and 18 August 2026.

Work carried out for the AWS "Agents for Humans" submission period begins **18 August
2026** and covers the Strands Agents integration, the autonomous operation mode, the tool
layer and the escalation path. Those components are not yet present in this repository.

## License

MIT. See [LICENSE](LICENSE).
