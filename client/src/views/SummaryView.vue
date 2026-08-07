<script setup>
import { ref, onMounted } from "vue";
import { fetchSummary } from "../lib/summary.js";
import { formatPHP } from "../lib/formatters.js";

const period = ref("month");
const data = ref(null);
const periods = [
  { v: "month", label: "Month" },
  { v: "quarter", label: "Quarter" },
  { v: "year", label: "Year" },
];

async function load() { data.value = await fetchSummary(period.value); }
onMounted(load);

function setPeriod(v) {
  if (period.value === v) return;
  period.value = v;
  load();
}

function pctFmt(r) { return `${Math.round(r * 100)}%`; }
function arrow(d) { return d === "up" ? "▲" : d === "down" ? "▼" : "–"; }

const rows = [
  { key: "totalIncome", label: "Income (collected)", type: "money" },
  { key: "expected", label: "Expected", type: "money" },
  { key: "collectionRate", label: "Collection rate", type: "rate" },
  { key: "occupancyRate", label: "Occupancy", type: "rate" },
  { key: "newLeases", label: "New leases", type: "count" },
  { key: "terminatedLeases", label: "Terminated leases", type: "count" },
];

function fmt(value, type) {
  if (type === "money") return formatPHP(value);
  if (type === "rate") return pctFmt(value);
  return value;
}

function deltaText(row) {
  const d = data.value.deltas[row.key];
  if (row.type === "rate") return `${arrow(d.direction)} ${Math.round(d.change * 100)} pp`;
  return `${arrow(d.direction)} ${fmt(Math.abs(d.change), row.type)}`;
}
</script>

<template>
  <section class="summary">
    <header>
      <h1>Executive Summary</h1>
      <div class="seg">
        <button
          v-for="p in periods"
          :key="p.v"
          type="button"
          :class="{ active: period === p.v }"
          @click="setPeriod(p.v)"
        >
          {{ p.label }}
        </button>
      </div>
    </header>

    <div v-if="data">
      <p class="period-label">{{ data.period.label }} <span>vs prior {{ period }}</span></p>
      <table>
        <thead>
          <tr><th>Metric</th><th>This period</th><th>Prior</th><th>Change</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <td>{{ row.label }}</td>
            <td>{{ fmt(data.current[row.key], row.type) }}</td>
            <td>{{ fmt(data.prior[row.key], row.type) }}</td>
            <td :class="`delta delta--${data.deltas[row.key].direction}`">{{ deltaText(row) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else>Loading…</p>
  </section>
</template>

<style scoped>
.seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.seg button {
  background: var(--surface);
  color: var(--muted);
  border: none;
  border-radius: 0;
  padding: 0.5rem 1rem;
  box-shadow: none;
}
.seg button + button { border-left: 1px solid var(--line); }
.seg button.active { background: var(--accent); color: #fff; }
.period-label {
  color: var(--muted);
  margin: 0 0 1rem;
  font-size: 0.95rem;
}
.period-label span { color: var(--faint); }
.delta--up { color: var(--good); font-variant-numeric: tabular-nums; }
.delta--down { color: var(--danger); font-variant-numeric: tabular-nums; }
.delta--flat { color: var(--faint); }
</style>
