<script setup>
import { RouterLink, RouterView, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();
const links = [
  { to: "/", label: "Dashboard" },
  { to: "/owners", label: "Owners" },
  { to: "/units", label: "Units" },
  { to: "/tenants", label: "Tenants" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];

function logout() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <div class="layout">
    <nav class="app-nav">
      <RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
      <span class="user">{{ auth.user?.email }} ({{ auth.role }})</span>
      <button type="button" class="logout" @click="logout">Log out</button>
    </nav>
    <main><RouterView /></main>
  </div>
</template>
