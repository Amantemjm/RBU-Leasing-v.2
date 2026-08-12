<script setup>
import { ref, computed } from "vue";
import { useAuthStore } from "../stores/auth.js";
import ApprovalsView from "./ApprovalsView.vue";
import RequirementsView from "./RequirementsView.vue";
import OwnersView from "./OwnersView.vue";
import UnitsView from "./UnitsView.vue";
import TenantsView from "./TenantsView.vue";
import LeasesView from "./LeasesView.vue";
import PaymentsView from "./PaymentsView.vue";
import UsersView from "./UsersView.vue";

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === "ADMIN");

const BASE_TABS = [
  { key: "approvals", label: "Approvals", component: ApprovalsView },
  { key: "requirements", label: "Requirements", component: RequirementsView },
  { key: "owners", label: "Owners", component: OwnersView },
  { key: "units", label: "Units", component: UnitsView },
  { key: "tenants", label: "Tenants", component: TenantsView },
  { key: "leases", label: "Leases", component: LeasesView },
  { key: "payments", label: "Payments", component: PaymentsView },
];

const tabs = computed(() =>
  isAdmin.value ? [...BASE_TABS, { key: "users", label: "Users", component: UsersView }] : BASE_TABS,
);

const activeKey = ref("approvals");
const active = computed(() => tabs.value.find((t) => t.key === activeKey.value) || tabs.value[0]);
</script>

<template>
  <section>
    <div class="head">
      <h1>Administration</h1>
      <p class="muted">Manage records and system access.</p>
    </div>

    <nav class="tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: t.key === activeKey }"
        @click="activeKey = t.key"
      >{{ t.label }}</button>
    </nav>

    <div class="tab-panel">
      <component :is="active.component" :admin="true" />
    </div>
  </section>
</template>

<style scoped>
.head { margin-bottom: 1rem; }
.muted { color: var(--muted); }
.tabs {
  display: flex; flex-wrap: wrap; gap: 0.25rem;
  border-bottom: 1px solid var(--line);
  margin-bottom: 1.4rem;
}
.tab {
  background: none; border: none; cursor: pointer; font: inherit; font-weight: 500;
  color: var(--muted); padding: 0.6rem 0.95rem; border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text); background: var(--row-hover); }
.tab.active { color: var(--accent-text); border-bottom-color: var(--accent-text); }
.tab-panel { min-height: 4rem; }
</style>
