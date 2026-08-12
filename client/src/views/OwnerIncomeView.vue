<script setup>
import { ref, computed, onMounted } from "vue";
import { payments } from "../lib/resource.js";
import { formatPHP, formatDate } from "../lib/formatters.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const columns = [
  { key: "periodMonth", label: "Period", format: formatDate },
  { key: "unitNumber", label: "Unit" },
  { key: "tenantName", label: "Tenant" },
  { key: "amount", label: "Amount", format: formatPHP },
  { key: "paidDate", label: "Paid", format: formatDate },
  { key: "status", label: "Status" },
];

const collected = computed(() =>
  rows.value.filter((r) => r.paidDate).reduce((s, r) => s + Number(r.amount), 0),
);
const outstanding = computed(() =>
  rows.value.filter((r) => !r.paidDate).reduce((s, r) => s + Number(r.amount), 0),
);

async function load() {
  rows.value = (await payments.list()).map((p) => ({
    ...p,
    unitNumber: p.lease?.unit?.unitNumber || "—",
    tenantName: p.lease?.tenant?.name || "—",
  }));
}
onMounted(load);
</script>

<template>
  <section>
    <header><h1>My Income</h1></header>
    <div class="stats">
      <div class="stat"><span class="stat__k">Collected</span><span class="stat__v">{{ formatPHP(collected) }}</span></div>
      <div class="stat"><span class="stat__k">Outstanding</span><span class="stat__v">{{ formatPHP(outstanding) }}</span></div>
    </div>
    <ResourceTable :columns="columns" :rows="rows" :can-write="false" />
  </section>
</template>

<style scoped>
.stats { display: flex; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.stat {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow-sm); padding: 0.9rem 1.2rem; min-width: 160px;
}
.stat__k { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; }
.stat__v { font-family: var(--display); font-size: 1.5rem; font-weight: 500; color: var(--ink-800); font-variant-numeric: tabular-nums; }
</style>
