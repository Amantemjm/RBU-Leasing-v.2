<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const columns = [
  { key: "unitNumber", label: "Unit #" },
  { key: "tower", label: "Tower", format: (t) => t?.name || "—" },
  { key: "type", label: "Type" },
  { key: "baseRent", label: "Monthly Rent", format: formatPHP },
  { key: "status", label: "Status" },
  { key: "approvalStatus", label: "Approval" },
];

async function load() { rows.value = await units.list(); }
onMounted(load);
</script>

<template>
  <section>
    <header>
      <h1>My Units</h1>
      <button type="button" @click="router.push('/app/register-unit')">Register a unit</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="false" />
  </section>
</template>
