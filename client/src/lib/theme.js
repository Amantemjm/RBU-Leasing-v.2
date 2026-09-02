import { ref } from "vue";

// Light/dark preference — two states, nothing else. The theme is always stamped
// onto <html> as data-theme, which app.css matches via :root[data-theme="dark"]
// and :root:not([data-theme="light"]).
//
// There is no "follow the system" mode: the OS preference only seeds the very
// first visit, after which the switch position is the user's own choice and the
// OS no longer moves it.
//
// The matching pre-paint script in index.html applies the stored value before
// Vue mounts; keep the storage key and the accepted values in sync with it.
const KEY = "rbu-theme";
const CHOICES = ["light", "dark"];

function osPrefersDark() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch {
    return false;
  }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (CHOICES.includes(raw)) return raw;
  } catch {
    /* storage disabled (private mode) — fall through to the OS */
  }
  return osPrefersDark() ? "dark" : "light";
}

function apply(choice) {
  document.documentElement.setAttribute("data-theme", choice);
}

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return true; // can't ask — take the still, non-animated path
  }
}

// Apply the theme, cross-fading the page as one image.
//
// A theme switch repaints the entire window, so animating only part of it does
// not work: fading the body while the header and footer flipped instantly left
// the frame and the content in different themes for the length of the fade,
// which read as a tear rather than a transition. View Transitions hand the job
// to the browser — it snapshots the old page, applies the change in a single
// frame, then dissolves the whole viewport from the old image to the new one,
// so no element is ever out of step with its neighbour.
//
// Browsers without the API simply switch instantly, which is the right fallback
// and also what we do for reduced-motion.
function commit(choice) {
  const paint = () => apply(choice);
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    paint();
    return;
  }
  const transition = document.startViewTransition(paint);
  // Aborting a transition — which a fast double-toggle does — rejects every one
  // of its promises, not just `finished`. The theme is already applied by then,
  // so swallow all three; leaving any unhandled fills the console with
  // InvalidStateError. Older Chrome omits `updateCallbackDone`, hence the
  // optional chaining.
  for (const p of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) {
    p?.catch?.(() => {});
  }
}

// Module-level so every caller shares one value.
const theme = ref(read());
apply(theme.value); // initial paint — no animation

export function useTheme() {
  function setTheme(choice) {
    if (!CHOICES.includes(choice)) return;
    const changed = choice !== theme.value;
    theme.value = choice;
    if (changed) commit(choice);
    else apply(choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* preference is not persisted, but still applies for this session */
    }
  }

  function toggleTheme() {
    setTheme(theme.value === "dark" ? "light" : "dark");
  }

  return { theme, setTheme, toggleTheme, CHOICES };
}

export { CHOICES };
