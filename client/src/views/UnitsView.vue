<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const columns = [
  { key: "unitNumber", label: "Unit #" },
  { key: "type", label: "Type" },
  { key: "baseRent", label: "Base rent", format: formatPHP },
  { key: "status", label: "Status" },
];

async function load() { rows.value = await units.list(); }
onMounted(load);

function remove(row) {
  if (!confirm(`Delete unit "${row.unitNumber}"?`)) return;
  units.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Units</h1>
      <button v-if="canWrite" type="button" @click="router.push('/units/new')">New unit</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/units/${row.id}`)" @delete="remove" />
  </section>
</template>
