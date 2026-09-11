import { lazy, Suspense } from "react";
import HomePage from "@/imports/HomePage";

/**
 * The demo is code-split so the marketing page does not carry it.
 *
 * Almost every visitor lands on `/` and never opens the demo, and the demo
 * pulls in the agent stream client and the sample folder. Loading that on the
 * landing page would slow down the one thing everybody sees to speed up the
 * thing most people do not.
 */
const DemoApp = lazy(() => import("@/components/DemoApp"));

/**
 * Routing, without a router.
 *
 * The site is one marketing page plus one demo page. A routing library for two
 * routes would be more moving parts than the problem has. `/demo` works as a
 * real URL — not a hash — because the demo link is the thing being handed to
 * judges, and `/#demo` already means "scroll to the demo section" on the
 * landing page.
 *
 * This needs the Netlify rewrite in public/_redirects: the server has no file
 * at /demo, so without it Netlify returns its own 404 before React ever runs.
 */
export default function App() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  if (path === "/demo" || path.startsWith("/demo/")) {
    return (
      <Suspense
        fallback={<div className="min-h-screen bg-[#0c1120]" />}
      >
        <DemoApp />
      </Suspense>
    );
  }

  return <HomePage />;
}
