<script setup>
// Shared frame for the public Quick Inquiry form.
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import PublicShell from "../components/PublicShell.vue";

defineProps({
  lede: { type: String, default: "" },
});

const auth = useAuthStore();
const appHome = computed(() => (auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app"));
</script>

<template>
  <PublicShell main-label="Quick inquiry" skip-label="Skip to the inquiry form" narrow width="46rem" footer="slim">
    <template #nav-actions>
      <RouterLink v-if="auth.isAuthenticated" :to="appHome" class="nav__signin">Go to app</RouterLink>
      <RouterLink v-else to="/login" class="nav__signin">Sign in</RouterLink>
    </template>

    <div class="iq__intro">
      <p class="eyebrow">Residential &amp; Office Leasing</p>
      <h1>Quick Inquiry</h1>
      <p class="lede">{{ lede }}</p>
    </div>

    <div class="iq__card"><slot /></div>
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

.iq__card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 8px);
  box-shadow: var(--shadow-sm);
  padding: 1.8rem 2.2rem;
  color: var(--text);
}
@media (max-width: 560px) {
  .iq__card { padding: 1.35rem; }
}
</style>
