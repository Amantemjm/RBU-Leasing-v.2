<script setup>
import { ref, onMounted } from "vue";
import { leases } from "../lib/resource.js";
import { formatPHP, formatDate } from "../lib/formatters.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const columns = [
  { key: "unitNumber", label: "Unit" },
  { key: "tenantName", label: "Tenant" },
  { key: "startDate", label: "Start", format: formatDate },
  { key: "endDate", label: "End", format: formatDate },
  { key: "monthlyRent", label: "Monthly rent", format: formatPHP },
  { key: "status", label: "Status" },
];

async function load() {
  rows.value = (await leases.list()).map((l) => ({
    ...l, unitNumber: l.unit?.unitNumber || "—", tenantName: l.tenant?.name || "—",
  }));
}
onMounted(load);
</script>

<template>
  <section>
    <header><h1>My Leases</h1></header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="false" />
  </section>
</template>
