import HomePage from "@/imports/HomePage";

/**
 * The site is one page. The demo used to be routed here as a second one, back
 * when it was a hand-built copy of the app; it is now the real application in
 * guest mode, deployed separately, so this is a plain landing page again.
 */
export default function App() {
  return <HomePage />;
}
