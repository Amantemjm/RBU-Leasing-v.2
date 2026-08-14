<script setup>
import InfoSheetsStaff from "../components/InfoSheetsStaff.vue";
import lessorSheets from "../lib/lessorInfoSheets.js";
import { owners } from "../lib/resource.js";
</script>

<template>
  <InfoSheetsStaff
    :client="lessorSheets"
    :parent-list="() => owners.list()"
    parent-key="unitOwner"
    parent-label="Owner"
    file-prefix="UnitOwnerInfoSheet"
    title="Lessor Sheets"
  />
</template>
