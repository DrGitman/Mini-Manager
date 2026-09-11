/**
 * Light/dark for the demo.
 *
 * Defaults to dark, which is both the app's own look and what matches the site
 * a visitor just came from. It is a default rather than a lock: someone who
 * prefers light should get light, and a demo that refuses is a demo that has
 * decided it knows better than the person using it.
 *
 * The choice is remembered in localStorage, so it survives the reload that
 * reusing a demo session already allows for.
 */

const KEY = "mm.demo.theme";

export type Theme = "dark" | "light";

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* private browsing — fall through to the default */
  }
  return "dark";
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* the toggle still works for this visit; it just will not persist */
  }
}
