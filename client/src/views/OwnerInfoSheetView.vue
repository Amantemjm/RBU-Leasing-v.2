<script setup>
import InfoSheetSelf from "../components/InfoSheetSelf.vue";
import lessorSheets from "../lib/lessorInfoSheets.js";
</script>

<template>
  <InfoSheetSelf :client="lessorSheets" file-prefix="UnitOwnerInfoSheet" />
</template>
