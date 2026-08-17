# Mini Manager

Mini Manager is an app that tidies up messy folders for you.

You point it at a folder, it looks at every file, and it works out what each one
is and where it should go. You see the full list of suggested changes before
anything happens. If you like them, you apply them in one click. If you change
your mind, you undo them in one click.

It never deletes anything. Files you don't want are moved to an Archive folder,
so you can always get them back.

---

## What it does

- **Scans a folder** and reads each file's name, size and date
- **Sorts files into categories** using AI — Documents, Finance, Photos, Code, and so on
- **Suggests better names** and the right folder for each file
- **Shows a confidence score** for every suggestion, so you know which ones to double-check
- **Flags sensitive files** (passports, bank statements, ID scans) and won't move them without asking
- **Remembers your corrections** — fix a suggestion once and it learns for next time
- **Takes rules in plain English** like "put all invoices in Finance/Invoices"
- **Keeps a full history** so any change can be undone later
- **Finds duplicates and old files** you've not touched in months
- **Has a chat assistant** you can ask to do things like "move all my PDFs to Documents"

---

## Plans

| | Free | Pro | Business |
|---|---|---|---|
| Price | $0 | $19/month | $49/seat/month |
| Folder scans | 250 files/month | Unlimited | Unlimited |
| AI sorting | 100/month | Unlimited | Unlimited |
| Document explanations | 3/month | 50/month | 50/month |
| Naming rules | 1 | Unlimited | Unlimited |
| Undo and Archive | Unlimited | Unlimited | Unlimited |

Undo is free on every plan, forever. We don't put safety behind a paywall.

---

## How it's built

The project has three parts in one folder:

| Folder | What it is |
|---|---|
| `app/`, `components/`, `lib/` | The app you actually use, built with Next.js |
| `backend/api/` | The server, built with Python and FastAPI |
| `website/` | The marketing site, built with Vite |
| `electron/` | Wraps the app so it runs as a Windows program |

**What each part uses:**

- **Frontend** — Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui components
- **Backend** — Python 3.13, FastAPI, PostgreSQL (hosted on Neon)
- **AI** — Groq handles file sorting, the chat assistant, conventions and onboarding.
  Google Gemini handles document explanations, plain-English rule compiling, and
  reading proof-of-payment documents.
- **Login** — email and password, with Google sign-in as an option. Sessions use JWT.
- **Payments** — Paddle for cards, plus AI-verified bank transfer (EFT) for Namibia
- **Desktop** — Electron
- **Hosting** — backend on Render, marketing site on Netlify, database on Neon

---

## Running it on your machine

You need **Node.js 18 or newer**, **pnpm**, and **Python 3.13**.

This project uses **pnpm**, not npm. Running `npm install` here will fail,
because npm doesn't understand how pnpm arranges its files.

### 1. Frontend

```bash
cd mini-manager-app
pnpm install
pnpm dev
```

Then open http://localhost:3000

### 2. Backend

```bash
cd mini-manager-app/backend/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Then start it from the `mini-manager-app` folder (not from inside `backend/api`,
or Python won't find the modules):

```bash
cd mini-manager-app
.\backend\api\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --reload --port 8000
```

The server runs on http://localhost:8000. Database tables are created
automatically the first time it starts.

### 3. Marketing website (optional)

```bash
cd mini-manager-app/website
pnpm install
pnpm dev
```

---

## Settings you need to provide

Create a file at `backend/api/.env` with these:

| Name | What it's for | Required |
|---|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string | Yes |
| `GROQ_API_KEY` | For sorting files | Yes |
| `GEMINI_API_KEY` | For explanations and chat | Yes |
| `JWT_SECRET` | A long random string that signs login tokens | Yes |
| `GROQ_MODEL` | Which Groq model to use. Defaults to `openai/gpt-oss-120b` | No |
| `FRONTEND_URL` | Your app's address, so the browser is allowed to talk to the server | No |
| `PADDLE_SANDBOX_API_KEY` | Payments | Only if you're taking payments |
| `PADDLE_WEBHOOK_SECRET` | Confirms payment messages really came from Paddle | Only if you're taking payments |
| `PADDLE_PRICE_ID_PRO` | The Pro plan's ID in Paddle | Only if you're taking payments |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in | Only if you want Google login |
| `GEMINI_MODEL` | Which Gemini model to use. Defaults to `gemini-flash-lite-latest` | No |
| `EXTRA_CORS_ORIGINS` | Extra sites allowed to call the API, comma-separated | No |

And these if you want bank-transfer payments. They're your real banking
details, so they belong in the environment, never in the repo:

| Name | What it's for |
|---|---|
| `EFT_ACCOUNT_NAME` | Name on the account, shown to customers |
| `EFT_BANK_NAME` | Bank name, shown to customers |
| `EFT_ACCOUNT_NUMBER` | Account number. Without it, the payment page returns 503 |
| `EFT_BRANCH_CODE` | Branch code. Optional — hidden if not set |
| `EFT_CURRENCY` | `NAD` for FNB Namibia, `ZAR` for South Africa |
| `EFT_ADMIN_EMAIL` | Who can reconcile payments. Must match your login email |
| `EFT_PROOF_EMAIL` | Optional address for customers who'd rather email their proof |

And a file at `mini-manager-app/.env.local` for the frontend:

| Name | What it's for |
|---|---|
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Loads the payment form. Safe to be public. |
| `NEXT_PUBLIC_PADDLE_PRICE_ID_PRO` | The Pro plan's ID |
| `NEXT_PUBLIC_PADDLE_ENV` | `sandbox` while testing, `production` when live |

Never put `PADDLE_SANDBOX_API_KEY` in a `NEXT_PUBLIC_` variable. Anything
starting with `NEXT_PUBLIC_` is visible to anyone using your site.

---

## Testing payments

Paddle has a sandbox mode so you can practise without real money. Real cards
are rejected there; use these test cards instead:

| Card number | What happens |
|---|---|
| `4242 4242 4242 4242` | Payment works |
| `4000 0038 0000 0446` | Payment works, with a 3D Secure step |
| `4000 0000 0000 0002` | Payment is declined |

Any future expiry date and any 3-digit code will do.

**One thing that catches people out:** after someone pays, Paddle sends a
message to your server to confirm it. Paddle can't reach `localhost`, so while
you're developing you need a tunnel:

```bash
ngrok http 8000
```

Then paste the address it gives you into the Paddle dashboard under
**Developer tools → Notifications**, with `/api/v1/webhooks/paddle` on the end.
Without this, payments go through but nobody's plan ever gets upgraded.

---

## Bank transfer payments (Namibia)

Namibian customers pay by instant bank transfer, and no bank offers an API that
tells a server "money arrived". So an AI agent closes the loop instead.

How it works:

1. The customer picks a plan and gets a reference like `MM-0042`, plus your bank details
2. They pay from their banking app using that reference
3. They upload the bank's confirmation — a PDF or screenshot
4. **Gemini reads the document** and extracts the amount, reference, date and bank
5. **Plain Python decides**, not the AI — it checks the reference matches, the amount
   is enough, the date is sensible, and the document isn't flagged as altered
6. All checks pass → the plan activates immediately, marked unreconciled
7. You check your bank statement and confirm on `/payments`

The AI only ever reports what it sees. It never decides to grant access — that
way a forged document can't argue its own case.

**Be honest about the risk:** proof of payment can be faked. This works because
the amounts are small, access is revocable, and you reconcile daily. Don't reuse
this pattern for large invoices or anything you can't take back.

The same document can never be submitted twice, uploads are capped at five per
user per hour (each one costs a Gemini call), and bank details are only shown to
a signed-in customer who has started a payment.

---

## Pages in the app

| Page | What it's for |
|---|---|
| `/organize` | The main one — scan a folder and apply changes |
| `/overview` | Summary of what's been organised |
| `/insights` | Duplicates, old files, storage breakdown |
| `/history` | Everything that's been done, with undo |
| `/quarantine` | Files moved to Archive, ready to restore |
| `/rules` | Your plain-English rules |
| `/documents` | Documents the AI has explained |
| `/settings` | Preferences, blocked folders, naming rules |
| `/profile` | Your name, photo, password, account |
| `/upgrade` | Plans and pricing |
| `/checkout` | Payment page — bank transfer or card |
| `/payments` | Owner only — reconcile EFT payments the AI verified |

---

## How some things work

**Nothing is deleted.** Files go to an Archive folder instead. You can always
put them back from the Quarantine page.

**Confidence scores.** Every AI suggestion comes with a score:

- **0.85 and above** — safe to apply without checking
- **0.70 to 0.85** — worth a quick look
- **Below 0.70** — decide for yourself

**Sensitive files.** Anything that looks like a passport, ID or bank document
gets flagged and is never moved unless you say so.

**Blocked folders.** You can list folders the app must never touch.

**Learning from you.** When you correct a suggestion, that correction is saved
and included next time, so the same mistake doesn't repeat.

---

## Things to know if you're working on this

- **Use pnpm, not npm.** npm crashes on this project's file layout.
- **Start the backend from `mini-manager-app`**, not from inside `backend/api`,
  or its imports won't resolve.
- **Model names live in one place** — `groq_model` and `gemini_model` in
  `backend/api/config.py`. Don't hardcode them anywhere else. Both providers
  retire models with about a week's notice, and a pinned name buried in a router
  is how that becomes an outage. Prefer a `-latest` alias for Gemini.
- **Payments are only real once the webhook arrives.** The browser saying
  "payment complete" doesn't mean the plan is active — the server has to hear
  from Paddle first.
- **Paddle's notification ID and its signing secret look alike.** Only the
  `pdl_ntfset_…` secret verifies a signature. Using the ID gives 401 on every
  webhook, and Paddle's delivery log is the fastest way to spot it.
- **Database changes** go in `backend/api/migrations/` as numbered `.sql` files.
  They run automatically when the server starts.
- **Don't edit files with PowerShell's `Set-Content`.** On Windows PowerShell it
  reads as ANSI and writes UTF-8 with a BOM, which mangles dashes and quotes and
  can push `'use client'` off the first line.
- **Python is pinned to 3.13** in `.python-version`. On 3.14 `pydantic-core` has
  no wheel and tries to build from Rust, which fails.

---

## Deploying

The backend runs on Render. `render.yaml` sets the build and start commands and
lists every environment variable, so **New → Blueprint** creates it in one step.
Leave Root Directory blank — this repo's root already is `mini-manager-app`.

Once deployed, point Paddle at:

```
https://<your-service>.onrender.com/api/v1/webhooks/paddle
```

subscribed to `subscription.activated`, `subscription.updated`,
`subscription.canceled` and `transaction.completed`. That replaces the ngrok
tunnel described above, which is only needed for local development.

Then build the desktop app against the hosted backend:

```powershell
$env:NEXT_PUBLIC_API_URL = "https://<your-service>.onrender.com"
$env:API_URL = "https://<your-service>.onrender.com"
pnpm electron:build
```

Both variables matter. Without them the installed app calls `localhost:8000` on
the user's machine and silently does nothing.

Render's free tier sleeps after about 15 minutes idle, and the next request
takes 50 seconds or so while it wakes. Warm it before a demo.

---

## Still to do

- [ ] Make the chat agent reliably execute commands (it chats correctly, but a
      command like "organise my Documents by type" doesn't always produce a task)
- [ ] Stop the same folder being recorded as several duplicate scans
- [ ] Let document explain read images and longer PDFs — it's capped at 2000
      characters of text today, though Gemini itself supports both
- [ ] Dedupe API calls on page load (preferences is fetched four times)
- [ ] Sign the Windows app so it doesn't trigger a SmartScreen warning
- [ ] Longer logins that survive more than two hours away
- [ ] Email notifications — nothing is emailed today, in or out
- [ ] Scheduled scans that run on their own
- [ ] Cloud folder support (Google Drive, OneDrive)

---

## License

Not yet decided.
