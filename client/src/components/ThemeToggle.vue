<script setup>
// Floating dark/light switch — minimal day↔night pill in the Ortigas brand
// green: a soft mint track with a white knob + brand-green sun by day; a deep
// brand-green track with the knob + moon by night, gliding smoothly across.
// Mounted once in App.vue so it holds the identical viewport position on every
// route — including login, signup and the public inquiry pages.
//
// The headers reserve room for it on the right (see --toggle-gutter in app.css);
// changing this control's OUTER width means changing that gutter too.
import { computed } from "vue";
import { useTheme } from "../lib/theme.js";

// `inline` docks the switch into a layout (e.g. the app nav bar) instead of
// floating fixed at the top-right of the viewport (used on public pages).
defineProps({ inline: { type: Boolean, default: false } });

const { theme, toggleTheme } = useTheme();

const isDark = computed(() => theme.value === "dark");
</script>

<template>
  <button
    type="button"
    class="themeswitch"
    :class="{ 'is-dark': isDark, 'themeswitch--inline': inline }"
    role="switch"
    :aria-checked="isDark ? 'true' : 'false'"
    aria-label="Dark mode"
    :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <span class="themeswitch__track" aria-hidden="true">
      <span class="themeswitch__knob">
        <!-- Day: line-art sun -->
        <svg class="themeswitch__ico themeswitch__ico--sun" viewBox="0 0 24 24" width="22" height="22"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="12" cy="12" r="4.1" />
          <line x1="12" y1="2.4" x2="12" y2="4.9" />
          <line x1="12" y1="19.1" x2="12" y2="21.6" />
          <line x1="2.4" y1="12" x2="4.9" y2="12" />
          <line x1="19.1" y1="12" x2="21.6" y2="12" />
          <line x1="5.3" y1="5.3" x2="7.1" y2="7.1" />
          <line x1="16.9" y1="16.9" x2="18.7" y2="18.7" />
          <line x1="18.7" y1="5.3" x2="16.9" y2="7.1" />
          <line x1="7.1" y1="16.9" x2="5.3" y2="18.7" />
        </svg>
        <!-- Night: line-art crescent moon + sparkles -->
        <svg class="themeswitch__ico themeswitch__ico--moon" viewBox="0 0 24 24" width="22" height="22"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15.4 3.3a7.6 7.6 0 1 0 5.3 12.9A6.1 6.1 0 0 1 15.4 3.3z" />
          <path d="M18.4 4.1l.62 1.66 1.66.62-1.66.62-.62 1.66-.62-1.66-1.66-.62 1.66-.62z" />
          <path d="M20.6 8.7l.36.98.98.36-.98.36-.36.98-.36-.98-.98-.36.98-.36z" />
        </svg>
      </span>
    </span>
  </button>
</template>

<style scoped>
.themeswitch {
  position: fixed;
  top: 16px;
  right: 18px;
  /* Above the sticky topbar (20) but below dropdowns (40+) and modals (50+),
     so an open dialog is never obscured by a floating control. */
  z-index: 30;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  line-height: 0;
  border-radius: 999px;
  /* A clean, smooth glide shared by the knob, track and icons. */
  --tsw-dur: 0.5s;
  /* Palette. The switch lives on the dark teal bar in both modes, so its own
     colours come from the chrome rather than from the page theme: the soft
     accent marks day, the deep ground marks night. */
  /* The soft accent straight from the palette (#93B1A6) leaves the white knob
     at 2.31:1 against it — under the 3:1 WCAG 1.4.11 asks of a control's
     moving part, which is why the day side looked washed while the night
     side (19.6:1) read fine. Carried 20% toward the chrome teal: the knob
     clears at 3.06 and the track still separates from the bar at 3.87. */
  --tsw-off: #7A9A91;
  --tsw-on: #040D12;
  --tsw-knob: #ffffff;
  --tsw-icon: var(--chrome-bg);
  /* The night track is the deep ground, which is darker than the bar it sits
     on — only 1.66:1 — so the ring is what makes the control's boundary
     visible. At 0.7 alpha it clears 3:1 against both the bar and the track,
     which is what WCAG 1.4.11 asks of a UI component boundary. */
  --tsw-edge: rgba(147, 177, 166, 0.7);
  --tsw-spring: cubic-bezier(0.65, 0, 0.35, 1);
  --tsw-glide: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Docked in the nav bar: no fixed positioning, sits inline with the topbar. */
.themeswitch--inline {
  position: static;
  top: auto;
  right: auto;
  z-index: auto;
  flex-shrink: 0;
}

.themeswitch__track {
  position: relative;
  display: block;
  width: 80px;
  height: 42px;
  border-radius: 999px;
  background: var(--tsw-off);
  border: 1px solid var(--tsw-edge);
  box-shadow: inset 0 1px 2px rgba(4, 13, 18, 0.18);
  transition: background var(--tsw-dur) var(--tsw-glide), border-color var(--dur-2) var(--ease-out);
}
.themeswitch.is-dark .themeswitch__track {
  /* The night side is the palette's deepest ground, flat rather than a
     gradient, to match the restraint of the rest of the system. */
  background: var(--tsw-on);
  border-color: var(--tsw-edge);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
}

/* White knob carrying the current celestial icon (brand-green stroke). */
.themeswitch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--tsw-knob);
  border: 1px solid var(--tsw-edge);
  box-shadow: 0 1px 5px rgba(4, 13, 18, 0.32);
  color: var(--tsw-icon); /* icon stroke reads strongly on the white knob */
  transform: translateX(38px); /* day → right */
  will-change: transform;
  transition: transform var(--tsw-dur) var(--tsw-spring),
    border-color var(--tsw-dur) var(--tsw-glide), box-shadow var(--tsw-dur) var(--tsw-glide);
}
.themeswitch.is-dark .themeswitch__knob {
  transform: translateX(0); /* night → left */
  border-color: var(--tsw-edge);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
}
/* A small press feedback that respects the current side. */
.themeswitch:active .themeswitch__knob { transform: translateX(38px) scale(0.93); }
.themeswitch.is-dark:active .themeswitch__knob { transform: translateX(0) scale(0.93); }

/* Icons crossfade between sun (day) and moon (night). */
.themeswitch__ico {
  grid-area: 1 / 1;
  transition: opacity calc(var(--tsw-dur) * 0.6) var(--tsw-glide), transform var(--tsw-dur) var(--tsw-spring);
}
.themeswitch__ico--sun { opacity: 1; transform: rotate(0deg) scale(1); }
.themeswitch__ico--moon { opacity: 0; transform: rotate(35deg) scale(0.55); }
.themeswitch.is-dark .themeswitch__ico--sun { opacity: 0; transform: rotate(-35deg) scale(0.55); }
.themeswitch.is-dark .themeswitch__ico--moon { opacity: 1; transform: rotate(0deg) scale(1); }

.themeswitch:hover .themeswitch__track,
.themeswitch.is-dark:hover .themeswitch__track { border-color: var(--chrome-accent); }
.themeswitch:focus-visible { outline: none; box-shadow: var(--ring); }

/* Narrow screens: same corner, smaller footprint, so crowded headers still fit
   beside it. Keep --toggle-gutter (app.css) in step with these numbers. */
@media (max-width: 620px) {
  .themeswitch { top: 12px; right: 10px; }
  .themeswitch__track { width: 66px; height: 36px; }
  .themeswitch__knob { width: 30px; height: 30px; top: 3px; left: 3px; transform: translateX(30px); }
  .themeswitch.is-dark .themeswitch__knob { transform: translateX(0); }
  .themeswitch:active .themeswitch__knob { transform: translateX(30px) scale(0.93); }
  .themeswitch.is-dark:active .themeswitch__knob { transform: translateX(0) scale(0.93); }
  .themeswitch__ico { width: 18px; height: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .themeswitch__track, .themeswitch__knob, .themeswitch__ico { transition: none; }
}

/* A theme switch is screen furniture — it has no business on a printed lease. */
@media print { .themeswitch { display: none; } }
</style>
