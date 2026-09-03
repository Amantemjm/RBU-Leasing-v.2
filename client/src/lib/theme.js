import { ref } from "vue";

// Theme preference — three states: an explicit "light" or "dark", or "system",
// which follows the OS and keeps following it as the OS flips. The preference is
// stamped onto <html> as data-theme for the explicit choices; "system" removes
// the attribute so app.css falls through to its `@media (prefers-color-scheme)`
// path (and `:root:not([data-theme="light"])`).
//
// The pre-paint script in index.html applies a stored *explicit* value before
// Vue mounts, and leaves the attribute off for "system"/unset — keep the storage
// key and accepted values in sync with it.
const KEY = "rbu-theme";
const PREFS = ["light", "dark", "system"];
// Back-compat alias: earlier code imported CHOICES.
const CHOICES = PREFS;

function osPrefersDark() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch {
    return false;
  }
}

function readPref() {
  try {
    const raw = localStorage.getItem(KEY);
    if (PREFS.includes(raw)) return raw;
  } catch {
    /* storage disabled (private mode) — fall through to system */
  }
  return "system"; // default: follow the OS until the user chooses otherwise
}

// The concrete theme a preference resolves to right now — "system" reads the OS.
function resolve(pref) {
  return pref === "system" ? (osPrefersDark() ? "dark" : "light") : pref;
}

function apply(pref) {
  if (pref === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", pref);
}

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return true; // can't ask — take the still, non-animated path
  }
}

// Apply the theme, cross-fading the page as one image (see the long note this
// replaces: a theme switch repaints the whole window, so View Transitions hand
// the dissolve to the browser; unsupported browsers switch instantly).
function commit(pref) {
  const paint = () => apply(pref);
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    paint();
    return;
  }
  const transition = document.startViewTransition(paint);
  for (const p of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) {
    p?.catch?.(() => {});
  }
}

// Module-level so every caller shares one value.
const preference = ref(readPref());
const resolved = ref(resolve(preference.value));
apply(preference.value); // initial paint — no animation

// While in "system" mode, track the OS so the resolved value (and any control
// that shows a concrete sun/moon state) stays in step. app.css already reacts to
// the OS on its own via the media query; this only keeps our JS mirror honest.
try {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onOsChange = () => {
    if (preference.value === "system") resolved.value = resolve("system");
  };
  if (mql.addEventListener) mql.addEventListener("change", onOsChange);
  else if (mql.addListener) mql.addListener(onOsChange); // older Safari
} catch {
  /* matchMedia unavailable — nothing to track */
}

export function useTheme() {
  function setTheme(pref) {
    if (!PREFS.includes(pref)) return;
    // Cross-fade only when the *visible* theme changes. Moving between "system"
    // and an explicit choice that resolves to the same look (e.g. System→Light
    // while the OS is already light) just re-stamps the attribute, no dissolve.
    const nextResolved = resolve(pref);
    const visualChanged = nextResolved !== resolved.value;
    preference.value = pref;
    resolved.value = nextResolved;
    if (visualChanged) commit(pref);
    else apply(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* preference is not persisted, but still applies for this session */
    }
  }

  // Two-way flip for the plain switch (public pages): always lands on an
  // explicit light/dark, chosen as the opposite of what's showing now.
  function toggleTheme() {
    setTheme(resolved.value === "dark" ? "light" : "dark");
  }

  // `theme` is the resolved (concrete) value, kept as an alias so existing
  // callers that only care about light-vs-dark keep working.
  return { preference, resolved, theme: resolved, setTheme, toggleTheme, PREFS, CHOICES };
}

export { PREFS, CHOICES };
