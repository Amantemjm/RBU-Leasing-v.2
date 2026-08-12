<script setup>
import { useAuthStore } from "../stores/auth.js";
import OwnerProfileView from "./OwnerProfileView.vue";
import TenantProfileView from "./TenantProfileView.vue";

const auth = useAuthStore();
</script>

<template>
  <component :is="auth.isOwner ? OwnerProfileView : TenantProfileView" />
</template>
