<script setup>
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const links = [
  { to: "/", label: "Dashboard" },
  { to: "/summary", label: "Summary" },
  { to: "/reports", label: "Reports" },
  { to: "/owners", label: "Owners" },
  { to: "/units", label: "Units" },
  { to: "/tenants", label: "Tenants" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];

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
    <aside class="app-sidebar">
      <div class="brand">
        <span class="brand__mark">RBU</span>
        <span class="brand__sub">Leasing</span>
      </div>
      <nav class="app-nav">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" :class="{ active: isActive(l.to) }">
          {{ l.label }}
        </RouterLink>
      </nav>
      <div class="sidebar-foot">
        <div class="who">
          <span class="email">{{ auth.user?.email }}</span>
          <span v-if="auth.role" class="role">{{ auth.role }}</span>
        </div>
        <button type="button" class="logout" @click="logout">Log out</button>
      </div>
    </aside>
    <main class="app-main"><RouterView /></main>
  </div>
</template>
