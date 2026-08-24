<script setup>
import InfoSheetsStaff from "../components/InfoSheetsStaff.vue";
import lesseeSheets from "../lib/lesseeInfoSheets.js";
import { tenants } from "../lib/resource.js";
</script>

<template>
  <InfoSheetsStaff
    :client="lesseeSheets"
    :parent-list="() => tenants.list()"
    parent-key="tenant"
    parent-label="Tenant"
    file-prefix="LesseeAcceptanceForm"
    title="Lessee Acceptance Forms"
  />
</template>
