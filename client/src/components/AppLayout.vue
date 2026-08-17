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
const isDark = computed(() => theme.value === "dark" || (theme.value === null && prefersDark()));

// --- Sidebar + user menu state ---
const isNarrow = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(max-width: 860px)").matches : false;
const sidebarOpen = ref(!isNarrow);
const menuOpen = ref(false);

onMounted(() => {
  let saved = null;
  try { saved = localStorage.getItem("rbu-theme"); } catch { /* ignore */ }
  if (saved === "dark" || saved === "light") { theme.value = saved; applyTheme(saved); }
});

// Grouped navigation. `admin` = Super Admin only, `write` = write staff.
const STAFF_GROUPS = [
  { label: "Workspace", items: [
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
  ] },
  { label: "Administration", items: [
    { to: "/app/users", label: "System Users", icon: "shield", admin: true },
    { to: "/app/audit", label: "Audit Trail", icon: "list", admin: true },
  ] },
];
const OWNER_GROUPS = [{ label: null, items: [
  { to: "/app/my-units", label: "My Units", icon: "building" },
  { to: "/app/info-sheet", label: "Information Sheet", icon: "clipboard" },
  { to: "/app/my-leases", label: "My Leases", icon: "file" },
  { to: "/app/my-profile", label: "My Profile", icon: "user" },
] }];
const TENANT_GROUPS = [{ label: null, items: [
  { to: "/app/my-lease", label: "My Lease", icon: "file" },
  { to: "/app/info-sheet-tenant", label: "Information Sheet", icon: "clipboard" },
  { to: "/app/requirements", label: "Requirements", icon: "folder" },
  { to: "/app/my-profile", label: "My Profile", icon: "user" },
] }];

const groups = computed(() => {
  const base = auth.isOwner ? OWNER_GROUPS : auth.isTenant ? TENANT_GROUPS : STAFF_GROUPS;
  return base
    .map((g) => ({ label: g.label, items: g.items.filter((i) => (i.admin ? auth.role === "ADMIN" : i.write ? auth.canWrite : true)) }))
    .filter((g) => g.items.length);
});
const allItems = computed(() => groups.value.flatMap((g) => g.items));

function isActive(to) {
  return to === "/app" ? route.path === "/app" : route.path.startsWith(to);
}
const currentLabel = computed(() => {
  const match = allItems.value.find((i) => isActive(i.to));
  return match ? match.label : "";
});

const isClientPortal = computed(() => auth.isOwner || auth.isTenant);
const brandName = computed(() => (isClientPortal.value ? "Ortigas Land" : "RBU Leasing"));
const brandSub = computed(() => (isClientPortal.value ? "Leasing Portal" : "Back Office"));

const initials = computed(() => {
  const n = auth.user?.name || auth.user?.email || "U";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
});

function onNav() {
  menuOpen.value = false;
  if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) sidebarOpen.value = false;
}
function logout() {
  auth.logout();
  router.push("/");
}
</script>

<template>
  <div class="shell" :class="{ 'sidebar-collapsed': !sidebarOpen }">
    <div v-if="sidebarOpen" class="scrim" @click="sidebarOpen = false"></div>

    <aside class="sidebar">
      <div class="sidebar__brand">
        <button
          type="button" class="sidebar__mark"
          @click="sidebarOpen = !sidebarOpen"
          :aria-label="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
          :title="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
        >
          <img :src="logoUrl" class="sidebar__mark-logo" alt="Ortigas Land" />
          <AppIcon name="chevron" :size="15" class="sidebar__mark-expand" />
        </button>
        <div v-if="sidebarOpen" class="sidebar__brandtext">
          <span class="sidebar__name">{{ brandName }}</span>
          <span class="sidebar__sub">{{ brandSub }}</span>
        </div>
        <button
          v-if="sidebarOpen" type="button" class="sidebar__collapse"
          @click="sidebarOpen = false" aria-label="Collapse sidebar" title="Collapse sidebar"
        >
          <AppIcon name="chevron" :size="16" />
        </button>
      </div>

      <nav class="sidebar__nav">
        <div v-for="(g, gi) in groups" :key="gi" class="navgroup">
          <p v-if="g.label && sidebarOpen" class="navgroup__label">{{ g.label }}</p>
          <div v-else-if="g.label && gi > 0" class="navgroup__rule"></div>
          <RouterLink
            v-for="l in g.items" :key="l.to" :to="l.to"
            class="navlink" :class="{ active: isActive(l.to) }"
            :title="!sidebarOpen ? l.label : undefined" @click="onNav"
          >
            <span class="navlink__icon"><AppIcon :name="l.icon" :size="18" /></span>
            <span v-if="sidebarOpen" class="navlink__label">{{ l.label }}</span>
          </RouterLink>
        </div>
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
          <button type="button" class="tbar-icon" title="Notifications" aria-label="Notifications">
            <AppIcon name="bell" :size="18" /><span class="tbar-dot"></span>
          </button>
          <button type="button" class="tbar-icon" title="Help" aria-label="Help">
            <AppIcon name="help" :size="18" />
          </button>
          <button type="button" class="icon-btn" @click="toggleTheme" :title="isDark ? 'Switch to light' : 'Switch to dark'" aria-label="Toggle theme">◐</button>

          <div class="usermenu">
            <button type="button" class="userchip" :class="{ open: menuOpen }" @click="menuOpen = !menuOpen" aria-haspopup="menu" :aria-expanded="menuOpen">
              <span class="userchip__avatar">{{ initials }}</span>
              <span class="userchip__meta">
                <span class="userchip__name">{{ auth.user?.name || auth.user?.email }}</span>
                <span v-if="auth.role" class="userchip__role">{{ roleLabel(auth.role) }}</span>
              </span>
              <AppIcon name="chevron-down" :size="15" class="userchip__caret" />
            </button>
            <div class="menu" v-show="menuOpen" role="menu">
              <div class="menu__head">
                <span class="userchip__avatar lg">{{ initials }}</span>
                <div>
                  <div class="menu__name">{{ auth.user?.name || auth.user?.email }}</div>
                  <div class="menu__email">{{ auth.user?.email }}</div>
                  <span v-if="auth.role" class="menu__role">{{ roleLabel(auth.role) }}</span>
                </div>
              </div>
              <button type="button" class="menu__item" @click="toggleTheme">
                <AppIcon name="grid" :size="15" /> {{ isDark ? "Light theme" : "Dark theme" }}
              </button>
              <button type="button" class="menu__item logout" @click="logout">
                <AppIcon name="logout" :size="15" /> Log out
              </button>
            </div>
            <div v-show="menuOpen" class="menu-scrim" @click="menuOpen = false"></div>
          </div>
        </div>
      </header>

      <main class="app-main"><RouterView /></main>
    </div>
  </div>
</template>
