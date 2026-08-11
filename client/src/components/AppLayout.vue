<script setup>
import { computed } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const OWNER_LINKS = [
  { to: "/my-units", label: "My Units" },
  { to: "/register-unit", label: "Register Unit" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];
const TENANT_LINKS = [{ to: "/requirements", label: "Requirements" }];
const STAFF_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/summary", label: "Summary" },
  { to: "/reports", label: "Reports" },
  { to: "/approvals", label: "Approvals", staffWrite: true },
  { to: "/requirements", label: "Requirements", staffWrite: true },
  { to: "/owners", label: "Owners" },
  { to: "/units", label: "Units" },
  { to: "/tenants", label: "Tenants" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];

const links = computed(() => {
  if (auth.isOwner) return OWNER_LINKS;
  if (auth.isTenant) return TENANT_LINKS;
  return STAFF_LINKS.filter((l) => {
    if (l.adminOnly) return auth.role === "ADMIN";
    if (l.staffWrite) return ["ADMIN", "LEASING_OFFICER"].includes(auth.role);
    return true;
  });
});

function isActive(to) {
  return to === "/" ? route.path === "/" : route.path.startsWith(to);
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
          v-if="auth.role === 'ADMIN'"
          to="/users"
          class="master-admin"
          :class="{ active: isActive('/users') }"
        >Master Admin</RouterLink>
        <div class="who">
          <span class="name">{{ auth.user?.name || auth.user?.email }}</span>
          <span v-if="auth.role" class="role">{{ auth.role }}</span>
        </div>
        <button type="button" class="logout" @click="logout">Log out</button>
      </div>
    </header>
    <main class="app-main"><RouterView /></main>
  </div>
</template>
