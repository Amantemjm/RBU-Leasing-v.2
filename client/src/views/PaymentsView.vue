<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { payments } from "../lib/resource.js";
import { formatPHP, formatDate } from "../lib/formatters.js";
import ResourceTable from "../components/ResourceTable.vue";

// Write controls only in the Master Admin hub (admin=true); read-only in main nav.
const props = defineProps({ admin: { type: Boolean, default: false } });
const rows = ref([]);
const router = useRouter();
const canWrite = computed(() => props.admin);
const columns = [
  { key: "leaseId", label: "Lease ID" },
  { key: "periodMonth", label: "Period", format: formatDate },
  { key: "amount", label: "Amount", format: formatPHP },
  { key: "dueDate", label: "Due", format: formatDate },
  { key: "paidDate", label: "Paid", format: formatDate },
  { key: "status", label: "Status" },
];

async function load() { rows.value = await payments.list(); }
onMounted(load);

function remove(row) {
  if (!confirm("Delete this payment?")) return;
  payments.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Payments</h1>
      <button v-if="canWrite" type="button" @click="router.push('/app/payments/new')">New payment</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/app/payments/${row.id}`)" @delete="remove" />
  </section>
</template>
