# Mini Manager

An AI-powered file organizer that scans your folders, proposes smart renames and moves, and lets you apply or undo changes with one click. Nothing is ever permanently deleted — everything goes through a quarantine system first.

---

## Features

### Free
- Scan any folder and see file proposals
- AI-suggested renames and folder moves
- Apply changes in one click
- Undo last 3 batches

### Pro
- Full AI confidence scoring
- Natural-language rules ("move all invoices to Finance")
- Full undo history
- Insights and storage analytics
- Duplicate file detection
- Document explainer

### Business
- Scheduled scans
- Quarantine management
- Bulk operations
- Priority support

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3 (App Router) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui + base-ui |
| AI | Gemini API (via Google Cloud Run) |
| Auth | Demo session (localStorage) |
| Icons | Lucide React |
| Package manager | pnpm |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

```bash
npm install -g pnpm
```

### Install dependencies

```bash
cd mini-manager-app
pnpm install
```

### Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production

```bash
pnpm build
pnpm start
```

---

## Project Structure

```
mini-manager-app/
├── app/
│   ├── (auth)/          # Login, signup, forgot password
│   ├── (app)/           # Main app shell (sidebar + topbar)
│   │   ├── overview/    # Dashboard
│   │   ├── organize/    # File scan + proposals
│   │   ├── insights/    # Analytics + duplicates (Pro)
│   │   ├── safety/      # History + quarantine (Pro)
│   │   ├── notifications/
│   │   ├── settings/
│   │   └── upgrade/
│   ├── onboarding/      # First-run flow
│   └── globals.css
├── components/
│   ├── layout/          # Sidebar, TopBar, AI panel, page transition
│   └── ui/              # Reusable UI components
├── lib/
│   ├── demo-data.ts     # Mock file library
│   ├── heuristics.ts    # Rule-based file classification
│   ├── session.ts       # Auth helpers
│   └── types.ts         # Shared TypeScript types
└── public/              # Logos and static assets
```

---

## Key Design Decisions

**No permanent deletion** — files are always moved to a Quarantine folder, never deleted. Users can restore anything at any time.

**Confidence buckets** — AI proposals are split into three tiers:
- `auto` (≥0.85) — safe to apply without review
- `review` (0.70–0.85) — worth a quick look before applying
- `input` (<0.70) — needs user decision

**Plan gating** — Pro features show a lock icon in the sidebar and redirect to the upgrade page. Free users always see what's available to them without feeling blocked.

**AI chat panel** — accessible via the Sparkles icon in the top bar. Supports text and voice input (Web Speech API). Slides in as an overlay so it doesn't push the main content.

---

## Roadmap

- [ ] Real filesystem access via File System Access API (Chrome/Edge)
- [ ] Gemini API integration for live AI classification
- [ ] Tauri v2 wrapper for full native desktop support
- [ ] Scheduled scans
- [ ] Cloud Run backend for rules compilation and document explainer
- [ ] Real auth (Supabase or Firebase)

---

## License

Private — all rights reserved.
