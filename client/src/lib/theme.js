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

// Turn on a brief, page-wide colour cross-fade for the moment of a switch. The
// `theme-anim` class (see app.css) enables blanket colour transitions; we remove
// it once the fade is done so it never slows ordinary interactions. Skipped when
// the user prefers reduced motion.
let animTimer;
function animateThemeChange() {
  const el = document.documentElement;
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    return;
  }
  el.classList.add("theme-anim");
  clearTimeout(animTimer);
  animTimer = setTimeout(() => el.classList.remove("theme-anim"), 600);
}

// Module-level so every caller shares one value.
const theme = ref(read());
apply(theme.value); // initial paint — no animation

export function useTheme() {
  function setTheme(choice) {
    if (!CHOICES.includes(choice)) return;
    if (choice !== theme.value) animateThemeChange();
    theme.value = choice;
    apply(choice);
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
