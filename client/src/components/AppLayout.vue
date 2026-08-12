<script setup>
import { computed, ref, onMounted } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import { roleLabel } from "../lib/formatters.js";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// Theme: unset follows the OS; toggling stores an explicit light/dark choice.
const theme = ref(null);

function applyTheme(t) {
  const el = document.documentElement;
  if (t) el.setAttribute("data-theme", t);
  else el.removeAttribute("data-theme");
}
function prefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function toggleTheme() {
  const current = theme.value || (prefersDark() ? "dark" : "light");
  theme.value = current === "dark" ? "light" : "dark";
  applyTheme(theme.value);
  try { localStorage.setItem("rbu-theme", theme.value); } catch { /* ignore */ }
}
onMounted(() => {
  let saved = null;
  try { saved = localStorage.getItem("rbu-theme"); } catch { /* ignore */ }
  if (saved === "dark" || saved === "light") {
    theme.value = saved;
    applyTheme(saved);
  }
});

const OWNER_LINKS = [
  { to: "/app/my-units", label: "My Units" },
  { to: "/app/register-unit", label: "Register Unit" },
  { to: "/app/leases", label: "Leases" },
  { to: "/app/payments", label: "Payments" },
];
const TENANT_LINKS = [{ to: "/app/requirements", label: "Requirements" }];
const STAFF_LINKS = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/summary", label: "Summary" },
  { to: "/app/reports", label: "Reports" },
  { to: "/app/inquiries", label: "Inquiries" },
];

const links = computed(() => {
  if (auth.isOwner) return OWNER_LINKS;
  if (auth.isTenant) return TENANT_LINKS;
  return STAFF_LINKS;
});

function isActive(to) {
  return to === "/app" ? route.path === "/app" : route.path.startsWith(to);
}

function logout() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <div class="layout">
    <header class="app-topbar">
      <div class="brand">
        <span class="brand__mark">RBU</span>
        <span class="brand__sub">Leasing</span>
      </div>
      <nav class="app-nav">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" :class="{ active: isActive(l.to) }">
          {{ l.label }}
        </RouterLink>
      </nav>
      <div class="topbar-foot">
        <RouterLink
          v-if="auth.canWrite"
          to="/app/admin"
          class="master-admin"
          :class="{ active: isActive('/app/admin') }"
        >Master Admin</RouterLink>
        <div class="who">
          <span class="name">{{ auth.user?.name || auth.user?.email }}</span>
          <span v-if="auth.role" class="role">{{ roleLabel(auth.role) }}</span>
        </div>
        <button type="button" class="theme-toggle" @click="toggleTheme" aria-label="Toggle light or dark theme" title="Toggle theme">◐</button>
        <button type="button" class="logout" @click="logout">Log out</button>
      </div>
    </header>
    <main class="app-main"><RouterView /></main>
  </div>
</template>
