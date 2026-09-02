<script setup>
// Shared frame for the public Quick Inquiry flow (choose role → form).
//
// This used to be its own full-viewport deep-green canvas with drifting glows
// and no header or footer, which meant it never followed the light/dark theme.
// It now sits inside PublicShell like every other public page; the intro, the
// two-step progress and the card are all that remain of it.
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import PublicShell from "../components/PublicShell.vue";

defineProps({
  step: { type: Number, default: 1 },
  lede: { type: String, default: "" },
});

const auth = useAuthStore();
const appHome = computed(() => (auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app"));
</script>

<template>
  <PublicShell main-label="Quick inquiry" skip-label="Skip to the inquiry form" narrow width="46rem">
    <template #nav-actions>
      <RouterLink v-if="auth.isAuthenticated" :to="appHome" class="nav__signin">Go to app</RouterLink>
      <RouterLink v-else to="/login" class="nav__signin">Sign in</RouterLink>
    </template>

    <div class="iq__intro">
      <p class="eyebrow">Residential &amp; Office Leasing</p>
      <h1>Quick Inquiry</h1>
      <p class="lede">{{ lede || "Tell us what you're looking for — our leasing team follows up within one business day." }}</p>
      <ol class="steps" aria-label="Progress">
        <li :class="{ on: step >= 1, done: step > 1 }"><span class="steps__dot">1</span>Who you are</li>
        <li class="steps__bar" aria-hidden="true"></li>
        <li :class="{ on: step >= 2 }"><span class="steps__dot">2</span>Your inquiry</li>
      </ol>
    </div>

    <div class="iq__card"><slot /></div>

    <p class="iq__foot"><slot name="foot" /></p>
  </PublicShell>
</template>

<style scoped>
.iq__intro { text-align: center; margin-bottom: 1.5rem; }
.eyebrow {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.2em;
  color: var(--accent-text); margin: 0 0 0.7rem; font-weight: 700;
}
.iq__intro h1 {
  font-family: var(--display); font-size: clamp(2rem, 5vw, 2.9rem); font-weight: 500;
  letter-spacing: -0.01em; margin: 0 0 0.55rem; color: var(--ink-800); line-height: 1.05;
}
.lede { color: var(--muted); margin: 0 auto; max-width: 42rem; font-size: 1.02rem; line-height: 1.55; }

.steps { list-style: none; display: flex; align-items: center; justify-content: center; gap: 0.7rem; margin: 1.1rem 0 0; padding: 0; }
.steps li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; font-weight: 600; color: var(--faint); }
.steps li.on { color: var(--ink-800); }
.steps__dot {
  width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; border: 1px solid var(--line-strong); color: var(--muted);
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.steps li.on .steps__dot { background: var(--accent-600); color: #fff; border-color: transparent; }
.steps li.done .steps__dot { background: var(--accent-050); color: var(--accent-text); border-color: transparent; }
.steps__bar { flex: 0 0 34px; height: 1px; background: var(--line-strong); }

.iq__card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 8px);
  box-shadow: var(--shadow-sm);
  padding: 1.8rem 2.2rem;
  color: var(--text);
}
.iq__foot { text-align: center; color: var(--faint); font-size: 0.78rem; margin: 1rem 0 0; letter-spacing: 0.02em; }

@media (max-width: 560px) {
  .iq__card { padding: 1.35rem; }
  .steps__bar { flex-basis: 18px; }
}
</style>
