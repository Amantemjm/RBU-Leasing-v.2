<script setup>
// Floating dark/light switch. Mounted once in App.vue rather than in each
// layout, so it holds the identical viewport position on every route —
// including login, signup and the public inquiry pages, which have no shell.
//
// The headers reserve room for it on the right (see --toggle-gutter in
// app.css); changing this control's width means changing that gutter too.
import { computed } from "vue";
import AppIcon from "./AppIcon.vue";
import { useTheme } from "../lib/theme.js";

const { theme, toggleTheme } = useTheme();

const isDark = computed(() => theme.value === "dark");
</script>

<template>
  <button
    type="button"
    class="themeswitch"
    :class="{ 'is-dark': isDark }"
    role="switch"
    :aria-checked="isDark ? 'true' : 'false'"
    aria-label="Dark mode"
    :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <span class="themeswitch__track" aria-hidden="true">
      <AppIcon name="sun" :size="13" class="themeswitch__ico themeswitch__ico--sun" />
      <AppIcon name="moon" :size="12" class="themeswitch__ico themeswitch__ico--moon" />
      <span class="themeswitch__knob"></span>
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
}

.themeswitch__track {
  position: relative;
  display: block;
  width: 52px;
  height: 28px;
  border-radius: 999px;
  background: var(--paper);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-sm);
  transition: background var(--dur-2) var(--ease-out), border-color var(--dur-2) var(--ease-out);
}

.themeswitch.is-dark .themeswitch__track {
  background: var(--accent);
  border-color: var(--accent);
}

/* Both icons sit on the track; the knob slides over whichever is inactive. */
.themeswitch__ico {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  transition: color var(--dur-2) var(--ease-out), opacity var(--dur-2) var(--ease-out);
}
.themeswitch__ico--sun { left: 6px; color: var(--warn); opacity: 1; }
.themeswitch__ico--moon { right: 7px; color: var(--faint); opacity: 0.75; }
.themeswitch.is-dark .themeswitch__ico--sun { opacity: 0.55; color: rgba(255, 255, 255, 0.75); }
.themeswitch.is-dark .themeswitch__ico--moon { opacity: 1; color: #fff; }

.themeswitch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(9, 30, 22, 0.32);
  transition: transform var(--dur-2) var(--ease-spring);
}
.themeswitch.is-dark .themeswitch__knob { transform: translateX(24px); }

.themeswitch:hover .themeswitch__track { border-color: var(--accent-text); }
.themeswitch:focus-visible { outline: none; box-shadow: var(--ring); }

/* Narrow screens: same corner, smaller footprint, so crowded headers still fit
   beside it. Keep --toggle-gutter (app.css) in step with these numbers. */
@media (max-width: 620px) {
  .themeswitch { top: 12px; right: 10px; }
  .themeswitch__track { width: 44px; height: 24px; }
  .themeswitch__knob { width: 17px; height: 17px; top: 3px; left: 3px; }
  .themeswitch.is-dark .themeswitch__knob { transform: translateX(20px); }
  .themeswitch__ico--sun { left: 5px; }
  .themeswitch__ico--moon { right: 5px; }
}

@media (prefers-reduced-motion: reduce) {
  .themeswitch__track, .themeswitch__knob, .themeswitch__ico { transition: none; }
}

/* A theme switch is screen furniture — it has no business on a printed lease. */
@media print { .themeswitch { display: none; } }
</style>
