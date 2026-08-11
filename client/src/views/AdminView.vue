<script setup>
import { computed } from "vue";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === "ADMIN");

const MANAGEMENT = [
  { to: "/approvals", label: "Approvals", desc: "Review unit registrations" },
  { to: "/requirements", label: "Requirements", desc: "Tenant document uploads" },
  { to: "/owners", label: "Owners", desc: "Lessor records" },
  { to: "/units", label: "Units", desc: "Units by estate & tower" },
  { to: "/tenants", label: "Tenants", desc: "Lessee records" },
  { to: "/leases", label: "Leases", desc: "Lease agreements" },
  { to: "/payments", label: "Payments", desc: "Rent collections" },
];

const cards = computed(() =>
  isAdmin.value
    ? [...MANAGEMENT, { to: "/users", label: "Users", desc: "Login credentials & access" }]
    : MANAGEMENT,
);
</script>

<template>
  <section>
    <div class="head">
      <h1>Administration</h1>
      <p class="muted">Manage records and system access.</p>
    </div>

    <div class="mgmt">
      <RouterLink v-for="m in cards" :key="m.to" :to="m.to" class="mgmt__card">
        <span class="mgmt__label">{{ m.label }}</span>
        <span class="mgmt__desc">{{ m.desc }}</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.head { margin-bottom: 1.25rem; }
.muted { color: var(--muted); }
.mgmt {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.9rem;
}
.mgmt__card {
  display: flex; flex-direction: column; gap: 0.3rem;
  padding: 1.05rem 1.15rem; border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  border-radius: var(--radius-sm); background: var(--surface, #fff);
  text-decoration: none; color: inherit; transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s;
}
.mgmt__card:hover {
  border-color: var(--accent); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08); transform: translateY(-1px);
}
.mgmt__label { font-weight: 600; color: var(--accent); font-size: 1.02rem; }
.mgmt__desc { font-size: 0.8rem; color: var(--muted); }
</style>
