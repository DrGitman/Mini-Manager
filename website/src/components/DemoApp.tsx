/**
 * The public guest demo, served from the marketing site at /demo.
 *
 * What is fake: the folder. A browser cannot read a filesystem.
 *
 * What is real: everything else. The same Strands agent, the same eleven tools,
 * the same safety kernel, the same confidence routing. The trace below is
 * emitted as each tool actually executes — it is not a scripted animation, and
 * the passport is escalated because `propose_changes` re-derives sensitivity on
 * the server, not because this page decided to highlight it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Check, Sparkles, ShieldAlert, FolderSearch, ArrowRight, Code2, AlertCircle,
  Sun, Moon,
} from "lucide-react";
import {
  openDemoSession, fetchState, runAgent, describeTool,
  SAMPLE_FILE_COUNT, DEMO_LIMIT, type DemoState,
} from "@/lib/demo";
import { storedTheme, saveTheme, type Theme } from "@/lib/theme";

const REPO = "https://github.com/DrGitman/Mini-Manager";

const SUGGESTIONS = [
  "Organise this folder",
  "What in here looks private?",
  "What have I not touched in a year?",
];

export default function DemoApp() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<DemoState | null>(null);
  const [booting, setBooting] = useState(true);
  const [slowBoot, setSlowBoot] = useState(false);
  const [bootError, setBootError] = useState("");

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");

  // Read after mount rather than in the initialiser: localStorage is not
  // available while this is being evaluated during a build-time render.
  useEffect(() => setTheme(storedTheme()), []);

  function toggleTheme() {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      saveTheme(next);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    // The API sleeps on Render's free tier and takes up to a minute to wake.
    // A bare spinner reads as broken at that length, and the person waiting is
    // a judge deciding whether to bother. Saying so keeps them on the page.
    const slow = setTimeout(() => !cancelled && setSlowBoot(true), 4000);

    openDemoSession()
      .then((s) => {
        if (cancelled) return;
        setToken(s.token);
        setState(s);
      })
      .catch((e) => !cancelled && setBootError(e.message))
      .finally(() => {
        if (cancelled) return;
        clearTimeout(slow);
        setBooting(false);
      });

    return () => { cancelled = true; clearTimeout(slow); };
  }, []);

  const exhausted = state?.exhausted ?? false;
  const left = state?.actions_left ?? DEMO_LIMIT;
  const limit = state?.limit ?? DEMO_LIMIT;

  const ask = useCallback(
    async (message: string) => {
      if (!token || running || exhausted) return;
      setRunning(true);
      setSteps([]);
      setReply("");
      setError("");

      await runAgent(token, message, {
        onTool: (name) =>
          setSteps((prev) => {
            const label = describeTool(name);
            return prev.includes(label) ? prev : [...prev, label];
          }),
        onText: (chunk) => setReply((prev) => prev + chunk),
        onError: (msg) => setError(msg),
      });

      // The action is spent server-side inside the agent route, so the count is
      // re-read rather than decremented here. A local guess would drift the
      // moment anything failed.
      const fresh = await fetchState(token);
      if (fresh) setState(fresh);
      setRunning(false);
    },
    [token, running, exhausted],
  );

  if (booting) {
    return (
      <Shell theme={theme}>
        <div className="max-w-sm text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          <p className="mt-4 text-[15px] text-foreground">Starting the demo…</p>
          {slowBoot && (
            <p className="mt-2 text-[13px] leading-[1.6] text-muted-foreground">
              The server sleeps when nobody is using it and takes up to a minute to wake.
              This only happens on the first visit.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  if (bootError) {
    return (
      <Shell theme={theme}>
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <p className="mt-3 text-[15px] leading-[1.6] text-foreground">{bootError}</p>
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 py-1.5 text-[14px] font-medium text-primary hover:underline"
          >
            Read the code on GitHub <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell theme={theme}>
      <div className="w-full max-w-[760px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <a
              href="/"
              className="inline-block py-1 text-[13px] text-muted-foreground hover:text-foreground"
            >
              ← Mini Manager
            </a>
            <h1 className="mt-1 text-[28px] font-bold leading-[1.15] text-foreground">
              The agent, live
            </h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Running on a sample folder of {SAMPLE_FILE_COUNT} files. No account, no install.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Counter left={left} limit={limit} />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* A judge should never have to guess which parts are real. */}
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3">
          <FolderSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-[1.6] text-muted-foreground">
            The folder is a fixed sample, because a browser cannot read your disk.
            Everything after that is real: the same agent, the same tools, the same safety
            kernel, and the same confidence thresholds the desktop app uses. Nothing here
            touches a file on your machine.
          </p>
        </div>

        {exhausted ? (
          <Exhausted />
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = input.trim();
                if (t) { setInput(""); ask(t); }
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={running}
                placeholder="Ask the agent to do something…"
                className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-[14px] text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={running || !input.trim()}
                className="flex h-11 min-w-[88px] items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run"}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={running}
                  className="rounded-full border border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {(steps.length > 0 || reply || error) && (
          <div className="mt-7 rounded-2xl border border-border bg-card p-5">
            {steps.length > 0 && (
              <div className="mb-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  What it actually did
                </p>
                <ol className="flex flex-col gap-2">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[14px] text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      {s}
                    </li>
                  ))}
                  {running && (
                    <li className="flex items-center gap-2 text-[14px] text-muted-foreground">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      Thinking…
                    </li>
                  )}
                </ol>
              </div>
            )}

            {reply && (
              <div className="flex gap-3 border-t border-border pt-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-foreground">
                  {reply}
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 border-t border-border pt-4 text-[14px] leading-[1.6] text-amber-500">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <main
      className={`${theme === "dark" ? "dark" : ""} flex min-h-screen justify-center bg-background px-5 py-12 sm:px-6`}
    >
      {children}
    </main>
  );
}

function Counter({ left, limit }: { left: number; limit: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < left ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>
      <span className="text-[13px] text-muted-foreground">
        {left} of {limit} {left === 1 ? "action" : "actions"} left
      </span>
    </div>
  );
}

function Exhausted() {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
      <h2 className="text-[20px] font-bold text-foreground">That is the demo</h2>
      <p className="mt-2 text-[15px] leading-[1.65] text-muted-foreground">
        You have used all {DEMO_LIMIT} actions. What you just saw was the real agent: it
        chose its own tools, scored every file, and refused to move the private ones
        without asking.
      </p>
      <p className="mt-3 text-[15px] leading-[1.65] text-muted-foreground">
        The full version runs on a schedule against your own folders, works while you are
        away, and carries out changes on your machine rather than only planning them. The
        desktop app is not released yet.
      </p>
      <a
        href={REPO}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Code2 className="h-4 w-4" />
        Read the code on GitHub
      </a>
    </div>
  );
}
