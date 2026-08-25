<script setup>
import ThemeToggle from "./components/ThemeToggle.vue";
</script>

<template>
  <router-view />
  <!-- Outside the router view on purpose: mounted once here, the toggle keeps
       the same fixed position across every route instead of being re-created
       (and re-positioned) by each layout. -->
  <ThemeToggle />
</template>
