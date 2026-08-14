<script setup>
import InfoSheetSelf from "../components/InfoSheetSelf.vue";
import lesseeSheets from "../lib/lesseeInfoSheets.js";
</script>

<template>
  <InfoSheetSelf :client="lesseeSheets" file-prefix="LesseeInfoSheet" />
</template>
