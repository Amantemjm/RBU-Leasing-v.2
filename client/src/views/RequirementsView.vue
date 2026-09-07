<script setup>
// Requirements module. Staff get one screen with Lessor / Lessee tabs; a tenant
// sees their own checklist, with any free-form uploads beneath it.
import { ref } from "vue";
import { useAuthStore } from "../stores/auth.js";
import LessorRequirementsView from "./LessorRequirementsView.vue";
import LesseeRequirementsPanel from "./LesseeRequirementsPanel.vue";
import MyLesseeRequirementsView from "./MyLesseeRequirementsView.vue";

const auth = useAuthStore();
const tab = ref("lessor"); // lessor | lessee
</script>

<template>
  <section>
    <header><h1>Requirements</h1></header>

    <template v-if="auth.isTenant">
      <!-- The checklist is the thing to act on; anything uploaded before it
           existed is still worth showing, so it sits underneath. -->
      <MyLesseeRequirementsView />
      <div class="other">
        <h2>Other documents</h2>
        <LesseeRequirementsPanel />
      </div>
    </template>

    <template v-else>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'lessor'" :class="['tab', { on: tab === 'lessor' }]" @click="tab = 'lessor'">Lessor</button>
        <button type="button" role="tab" :aria-selected="tab === 'lessee'" :class="['tab', { on: tab === 'lessee' }]" @click="tab = 'lessee'">Lessee</button>
      </div>
      <LessorRequirementsView v-if="tab === 'lessor'" />
      <LesseeRequirementsPanel v-else />
    </template>
  </section>
</template>

<style scoped>
.tabs {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: 1.25rem;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
}
.tab {
  background: transparent;
  border: none;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.88rem;
  padding: 0.45rem 1.2rem;
  border-radius: 999px;
  cursor: pointer;
}
.tab:hover { color: var(--ink-800); }
.tab.on { background: var(--surface); color: var(--accent-text); box-shadow: var(--shadow-sm); }
.other { margin-top: 1.6rem; padding-top: 1.2rem; border-top: 1px solid var(--line); }
.other h2 { font-size: 0.95rem; margin: 0 0 0.6rem; color: var(--ink-700); }
</style>
