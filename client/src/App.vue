<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import ThemeToggle from "./components/ThemeToggle.vue";

const route = useRoute();
// Inside the app shell (/app/*) the switch lives in the nav bar (AppLayout).
// On public pages (login, signup, inquiry) there is no nav bar, so keep the
// floating switch there.
const isPublic = computed(() => !route.path.startsWith("/app"));
</script>

<template>
  <router-view />
  <ThemeToggle v-if="isPublic" />
</template>
