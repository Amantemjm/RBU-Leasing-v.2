<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import ThemeToggle from "./components/ThemeToggle.vue";

const route = useRoute();
// The switch is docked in the nav bar wherever a page has one — AppLayout for
// /app/*, and the public portal, which declares `ownsThemeToggle` in its route
// meta. Anywhere else (login, signup, inquiry) has no bar, so it floats.
// Declared in meta rather than by path so a page and its toggle stay together.
const floatToggle = computed(
  () => !route.path.startsWith("/app") && !route.meta.ownsThemeToggle,
);
</script>

<template>
  <router-view />
  <ThemeToggle v-if="floatToggle" />
</template>
