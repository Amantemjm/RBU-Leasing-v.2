<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { leases } from "../lib/resource.js";
import { formatPHP, formatDate } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

// Only the Super Admin can modify records; everyone else sees a read-only view.
const auth = useAuthStore();
const rows = ref([]);
const router = useRouter();
const canWrite = computed(() => auth.role === "ADMIN");
const columns = [
  { key: "unitId", label: "Unit ID" },
  { key: "tenantId", label: "Tenant ID" },
  { key: "startDate", label: "Start", format: formatDate },
  { key: "endDate", label: "End", format: formatDate },
  { key: "monthlyRent", label: "Monthly rent", format: formatPHP },
  { key: "status", label: "Status" },
  { key: "modeOfPayment", label: "Mode" },
  { key: "source", label: "Source" },
];

async function load() { rows.value = await leases.list(); }
onMounted(load);

function remove(row) {
  if (!confirm("Delete this lease?")) return;
  leases.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Leases</h1>
      <button v-if="canWrite" type="button" @click="router.push('/app/leases/new')">New lease</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/app/leases/${row.id}`)" @delete="remove" />
  </section>
</template>
