<script setup>
import InfoSheetSelf from "../components/InfoSheetSelf.vue";
import lessorSheets from "../lib/lessorInfoSheets.js";
import { useAuthStore } from "../stores/auth.js";

// Lessors self-serve their acceptance form: passing the owner's id lets
// InfoSheetSelf start one on open when none exists yet (no officer request).
const auth = useAuthStore();
</script>

<template>
  <InfoSheetSelf :client="lessorSheets" file-prefix="UnitOwnerAcceptanceForm" :self-start-id="auth.unitOwnerId" />
</template>
