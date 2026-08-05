<script setup>
import { useAuthStore } from "../stores/auth.js";
const auth = useAuthStore();
</script>

<template>
  <main>
    <h1>Dashboard</h1>
    <p>Signed in as {{ auth.user?.email }} ({{ auth.role }})</p>
    <p>Metrics arrive in Plan 4.</p>
    <button @click="auth.logout()">Log out</button>
  </main>
</template>
