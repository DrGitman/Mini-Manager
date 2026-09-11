/**
 * The guest demo's session, sample folder, and agent stream.
 *
 * This lives in the marketing site rather than the Next app on purpose. The
 * Next app is the desktop shell's renderer — Electron bundles it into the
 * installer — so hosting it publicly just to serve one page would mean a third
 * deployment, a third cold start, and a second copy of the UI to keep in step.
 * The demo page needs nothing Next provides: it is a React component that talks
 * to the API over fetch.
 *
 * The folder is a fixed sample, because a browser cannot read a filesystem and
 * a demo claiming to have organised the visitor's real Downloads would be a
 * lie. Everything past that point is real: the same agent, the same eleven
 * tools, the same safety kernel, the same confidence thresholds.
 */

const BASE =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL) ??
  "https://mini-manager-api.onrender.com";

const TOKEN_KEY = "mm.demo.token";

export const DEMO_LIMIT = 8;

export interface DemoState {
  actions_used: number;
  actions_left: number;
  limit: number;
  exhausted: boolean;
}

export interface DemoSession extends DemoState {
  token: string;
  session_id: string;
}

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function store(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private browsing — the session simply will not survive a refresh */
  }
}

function clear(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Reuse the stored session, or start one.
 *
 * Reusing matters: handing out a fresh allowance on every refresh would make
 * the limit decorative, which is the whole thing the server-side ledger exists
 * to prevent.
 */
export async function openDemoSession(): Promise<DemoSession> {
  const existing = storedToken();
  if (existing) {
    const state = await fetchState(existing);
    if (state) return { ...state, token: existing, session_id: "" };
    clear(); // expired, or the server no longer knows it
  }

  const res = await fetch(`${BASE}/api/v1/demo/session`, { method: "POST" });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        "The demo has been started several times from this network recently. " +
          "Please try again in a little while.",
      );
    }
    throw new Error("Could not start the demo. Please try again.");
  }

  const session: DemoSession = await res.json();
  store(session.token);
  return session;
}

export async function fetchState(token: string): Promise<DemoState | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/demo/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ─── Agent stream ─────────────────────────────────────────────────────────────

export interface StreamHandlers {
  onTool?: (name: string) => void;
  onText?: (chunk: string) => void;
  onError?: (message: string) => void;
}

/**
 * Read the agent's SSE stream.
 *
 * EventSource cannot POST and the agent needs the folder digest in the body, so
 * the stream is read off fetch by hand. Events are separated by a blank line
 * and can straddle a chunk boundary, so the buffer is only consumed up to the
 * last complete separator — otherwise a tool call that lands on the boundary is
 * silently dropped, and the trace quietly loses a step.
 */
export async function runAgent(
  token: string,
  message: string,
  handlers: StreamHandlers,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/v1/agent/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message,
        scan_context: sampleScanContext(),
        preferences: { auto_threshold: 0.85, review_threshold: 0.7 },
        session_id: null,
      }),
    });
  } catch {
    handlers.onError?.("Could not reach the agent. Please try again.");
    return;
  }

  if (!response.ok) {
    // 402 is the demo running out, which is a normal ending rather than a
    // fault, so it carries the server's own wording.
    const detail = await response.text().catch(() => "");
    if (response.status === 402) {
      let msg = "That is the end of the demo.";
      try {
        msg = JSON.parse(detail).detail ?? msg;
      } catch {
        /* keep the default */
      }
      handlers.onError?.(msg);
    } else {
      handlers.onError?.(`The agent is unavailable (${response.status}).`);
    }
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError?.("The server sent no readable stream.");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      let event = "";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!event || !data) continue;

      let payload: { name?: string; text?: string; message?: string };
      try {
        payload = JSON.parse(data);
      } catch {
        continue; // a malformed frame is not worth killing the stream over
      }

      if (event === "tool" && payload.name) handlers.onTool?.(payload.name);
      else if (event === "text") handlers.onText?.(payload.text ?? "");
      else if (event === "error") handlers.onError?.(payload.message ?? "Something went wrong");
    }
  }
}

// ─── The sample folder ────────────────────────────────────────────────────────
//
// Shaped exactly like lib/folder-digests.ts::buildDigest in the app, because
// the agent's scan_folder tool reads that shape and must not be able to tell
// the difference. Windows-flavoured paths, so the kernel's path handling is
// exercised the same way it is on a real desktop.

const ROOT = "C:\\Users\\Guest\\Downloads";

interface SlimFile { n: string; s: number; m: string; p: string }

function f(name: string, kb: number, daysAgo: number): SlimFile {
  return {
    n: name,
    s: kb * 1024,
    m: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    p: `${ROOT}\\${name}`,
  };
}

const SAMPLE_FILES: SlimFile[] = [
  // The two that carry the demo. Both are confidently classifiable and both
  // must be escalated anyway — that contradiction is the entire argument.
  f("passport_scan.jpg", 2_480, 41),
  f("bank_statement_march.pdf", 318, 12),

  // Ordinary files, confidently filed. Without these the agent would look like
  // it escalates everything, which is useless rather than careful.
  f("Invoice_Q3_2026.pdf", 214, 8),
  f("lecture_notes_week4.txt", 12, 21),
  f("budget_tracker_2026.xlsx", 88, 3),
  f("resume_final_v3.docx", 46, 60),
  f("holiday_photo_01.jpg", 3_950, 95),
  f("holiday_photo_02.jpg", 4_110, 95),
  f("screenshot_2026-08-14.png", 640, 28),
  f("project_spec_draft.docx", 132, 5),
  f("setup_installer.exe", 84_300, 140),
  f("podcast_ep_212.mp3", 48_200, 33),

  // Old and untouched, so find_stale has something true to report.
  f("tax_return_2019.pdf", 402, 900),
  f("old_backup.zip", 152_000, 740),
];

export const SAMPLE_FILE_COUNT = SAMPLE_FILES.length;

export function sampleScanContext() {
  const by_extension: Record<string, { count: number; bytes: number }> = {};
  let total_bytes = 0;
  let stale_count = 0;
  const yearAgo = Date.now() - 365 * 86_400_000;

  for (const file of SAMPLE_FILES) {
    const ext = file.n.includes(".") ? file.n.split(".").pop()!.toLowerCase() : "none";
    by_extension[ext] ??= { count: 0, bytes: 0 };
    by_extension[ext].count++;
    by_extension[ext].bytes += file.s;
    total_bytes += file.s;
    if (new Date(file.m).getTime() < yearAgo) stale_count++;
  }

  const bySize = [...SAMPLE_FILES].sort((a, b) => b.s - a.s);
  const byDate = [...SAMPLE_FILES].sort((a, b) => a.m.localeCompare(b.m));

  return {
    watched_folders: [
      {
        root: ROOT,
        label: "Downloads (sample)",
        scanned_at: Date.now(),
        total_files: SAMPLE_FILES.length,
        total_bytes,
        by_extension,
        stale_count,
        empty_count: 0,
        sample_largest: bySize.slice(0, 15),
        sample_newest: [...byDate].reverse().slice(0, 10),
        sample_oldest: byDate.slice(0, 10),
        all_files: SAMPLE_FILES,
        all_files_truncated: false,
      },
    ],
  };
}

/** Human phrasing for each tool, so the trace reads as work, not function names. */
export function describeTool(name: string): string {
  switch (name) {
    case "scan_folder":        return "Looking through the folder";
    case "query_files":        return "Counting files";
    case "find_stale":         return "Finding files untouched for a while";
    case "check_rules":        return "Checking your filing rules";
    case "recall_corrections": return "Recalling past corrections";
    case "classify_files":     return "Working out where things belong";
    case "check_sensitive":    return "Checking for anything private";
    case "propose_changes":    return "Deciding what needs your say-so";
    case "apply_changes":      return "Preparing the approved changes";
    case "quarantine":         return "Moving things to the Archive";
    case "notify_user":        return "Asking you about something";
    default:                   return name.replace(/_/g, " ");
  }
}
