<script setup>
import { computed, ref, onMounted } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import { roleLabel } from "../lib/formatters.js";
import AppIcon from "./AppIcon.vue";
import logoUrl from "../assets/ortigas-logo.svg";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// --- Theme toggle (unset follows the OS; toggling stores an explicit choice) ---
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

// --- Sidebar state: open on desktop, overlay on mobile ---
const isNarrow = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(max-width: 860px)").matches : false;
const sidebarOpen = ref(!isNarrow);

onMounted(() => {
  let saved = null;
  try { saved = localStorage.getItem("rbu-theme"); } catch { /* ignore */ }
  if (saved === "dark" || saved === "light") { theme.value = saved; applyTheme(saved); }
});

// Flat sidebar items (Costa-style). Staff items filter by role: `admin` = Super
// Admin only, `write` = write staff (ADMIN/LEASING_OFFICER), otherwise all staff.
const STAFF_NAV = [
  { to: "/app", label: "Dashboard", icon: "grid" },
  { to: "/app/inquiries", label: "Inquiries", icon: "message" },
  { to: "/app/owners", label: "Owners", icon: "users" },
  { to: "/app/units", label: "Units", icon: "building" },
  { to: "/app/tenants", label: "Tenants", icon: "user" },
  { to: "/app/leases", label: "Leases", icon: "file" },
  { to: "/app/approvals", label: "Approvals", icon: "check", write: true },
  { to: "/app/lessor-sheets", label: "Lessor Sheets", icon: "clipboard", write: true },
  { to: "/app/lessee-sheets", label: "Lessee Sheets", icon: "clipboard", write: true },
  { to: "/app/requirements", label: "Requirements", icon: "folder", write: true },
  { to: "/app/users", label: "System Users", icon: "shield", admin: true },
  { to: "/app/audit", label: "Audit Trail", icon: "list", admin: true },
];
const OWNER_NAV = [
  { to: "/app/my-units", label: "My Units", icon: "building" },
  { to: "/app/info-sheet", label: "Information Sheet", icon: "clipboard" },
  { to: "/app/my-leases", label: "My Leases", icon: "file" },
  { to: "/app/my-profile", label: "My Profile", icon: "user" },
];
const TENANT_NAV = [
  { to: "/app/my-lease", label: "My Lease", icon: "file" },
  { to: "/app/info-sheet-tenant", label: "Information Sheet", icon: "clipboard" },
  { to: "/app/requirements", label: "Requirements", icon: "folder" },
  { to: "/app/my-profile", label: "My Profile", icon: "user" },
];

const items = computed(() => {
  if (auth.isOwner) return OWNER_NAV;
  if (auth.isTenant) return TENANT_NAV;
  return STAFF_NAV.filter((i) => (i.admin ? auth.role === "ADMIN" : i.write ? auth.canWrite : true));
});

function isActive(to) {
  return to === "/app" ? route.path === "/app" : route.path.startsWith(to);
}
const currentLabel = computed(() => {
  const all = [...STAFF_NAV, ...OWNER_NAV, ...TENANT_NAV];
  const match = all.find((i) => isActive(i.to));
  return match ? match.label : "";
});

// Lessor (owner) and Lessee (tenant) portals brand as "Ortigas Land"; O-Lease
// and back-office staff see the internal "RBU Leasing" brand.
const isClientPortal = computed(() => auth.isOwner || auth.isTenant);
const brandName = computed(() => (isClientPortal.value ? "Ortigas Land" : "RBU Leasing"));
const brandSub = computed(() => (isClientPortal.value ? "" : "Back Office"));

const initials = computed(() => {
  const n = auth.user?.name || auth.user?.email || "U";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
});

function onNav() {
  if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) sidebarOpen.value = false;
}
function logout() {
  auth.logout();
  router.push("/"); // back to the public Inquiry page
}
</script>

<template>
  <div class="shell" :class="{ 'sidebar-collapsed': !sidebarOpen }">
    <div v-if="sidebarOpen" class="scrim" @click="sidebarOpen = false"></div>

    <aside class="sidebar">
      <div class="sidebar__brand">
        <button
          type="button"
          class="sidebar__mark"
          @click="sidebarOpen = !sidebarOpen"
          :aria-label="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
          :aria-expanded="sidebarOpen"
          :title="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
        >
          <img :src="logoUrl" class="sidebar__mark-logo" alt="Ortigas Land" />
          <AppIcon name="chevron" :size="16" class="sidebar__mark-expand" />
        </button>
        <div v-if="sidebarOpen" class="sidebar__brandtext">
          <span class="sidebar__name">{{ brandName }}</span>
          <span v-if="brandSub" class="sidebar__sub">{{ brandSub }}</span>
        </div>
        <button
          v-if="sidebarOpen"
          type="button"
          class="sidebar__collapse"
          @click="sidebarOpen = false"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <AppIcon name="chevron" :size="16" />
        </button>
      </div>

      <nav class="sidebar__nav">
        <RouterLink
          v-for="l in items"
          :key="l.to"
          :to="l.to"
          class="navlink"
          :class="{ active: isActive(l.to) }"
          :title="!sidebarOpen ? l.label : undefined"
          @click="onNav"
        >
          <AppIcon :name="l.icon" :size="18" />
          <span v-if="sidebarOpen" class="navlink__label">{{ l.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="content">
      <header class="topbar">
        <button type="button" class="topbar__menu" @click="sidebarOpen = !sidebarOpen" aria-label="Toggle navigation">
          <AppIcon name="menu" :size="20" />
        </button>
        <div class="crumbs">
          <span class="crumbs__root">{{ brandName }}</span>
          <AppIcon name="chevron" :size="13" class="crumbs__sep" />
          <span class="crumbs__here">{{ currentLabel }}</span>
        </div>

        <div class="topbar__right">
          <button type="button" class="icon-btn" @click="toggleTheme" aria-label="Toggle light or dark theme" title="Toggle theme">◐</button>
          <div class="who">
            <span class="who__avatar">{{ initials }}</span>
            <span class="who__meta">
              <span class="who__name">{{ auth.user?.name || auth.user?.email }}</span>
              <span v-if="auth.role" class="who__role">{{ roleLabel(auth.role) }}</span>
            </span>
          </div>
          <button type="button" class="logout" @click="logout">
            <AppIcon name="logout" :size="15" /> <span class="logout__label">Log out</span>
          </button>
        </div>
      </header>

      <main class="app-main"><RouterView /></main>
    </div>
  </div>
</template>
