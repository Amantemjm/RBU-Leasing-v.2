<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { leasingTransactions } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";
import { stageByKey } from "../../../shared/leasingStages.js";

const router = useRouter();
const rows = ref([]);
const loading = ref(false);
const listError = ref("");

async function load() {
  loading.value = true; listError.value = "";
  try { rows.value = await leasingTransactions.list(); }
  catch (e) { listError.value = e.response?.data?.error || "Could not load transactions"; }
  finally { loading.value = false; }
}
onMounted(load);

function stageLabel(key) { return stageByKey(key)?.label || key; }
function daysInStage(t) {
  const started = t.stageData?.[t.stage]?.startedAt || t.updatedAt || t.createdAt;
  if (!started) return "—";
  const d = Math.floor((Date.now() - new Date(started).getTime()) / 86400000);
  return d <= 0 ? "Today" : `${d}d`;
}
const q = ref("");
const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  if (!term) return rows.value;
  return rows.value.filter((t) => [t.reference, t.lesseeName, t.unit?.unitNumber, stageLabel(t.stage), t.status]
    .some((x) => String(x || "").toLowerCase().includes(term)));
});

async function createNew() {
  const name = window.prompt("Lessee name for the new transaction");
  if (name == null) return;
  try {
    const t = await leasingTransactions.create({ lesseeName: name.trim() || null });
    router.push(`/app/transactions/${t.id}`);
  } catch (e) { listError.value = e.response?.data?.error || "Could not create transaction"; }
}
</script>

<template>
  <section>
    <header>
      <div>
        <h1>Leasing Tracker</h1>
        <p class="muted">Every leasing transaction from inquiry to contract, in one place.</p>
      </div>
      <button type="button" class="primary" @click="createNew">New transaction</button>
    </header>

    <div class="toolbar">
      <input v-model="q" type="search" class="search" placeholder="Search reference, lessee, unit, stage…" />
    </div>

    <p v-if="listError" class="error">{{ listError }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>
    <table v-else>
      <thead>
        <tr><th>Reference</th><th>Lessee</th><th>Unit</th><th>Stage</th><th>Status</th><th>Officer</th><th>In stage</th><th>Updated</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in filtered" :key="t.id" class="row" @click="router.push(`/app/transactions/${t.id}`)">
          <td><code class="ref">{{ t.reference }}</code></td>
          <td>{{ t.lesseeName || t.tenant?.name || "—" }}</td>
          <td>{{ t.unit ? (t.unit.unitNumber + (t.unit.building ? ` · ${t.unit.building}` : "")) : "—" }}</td>
          <td><span class="stage">{{ stageLabel(t.stage) }}</span></td>
          <td>{{ t.status }}</td>
          <td>{{ t.assignedOfficer?.name || "—" }}</td>
          <td>{{ daysInStage(t) }}</td>
          <td>{{ formatDate(t.updatedAt) }}</td>
        </tr>
        <tr v-if="!filtered.length"><td colspan="8" class="muted empty">No transactions yet. They are created automatically when an inquiry is accepted.</td></tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.toolbar { margin-bottom: 1rem; }
.search { font: inherit; font-size: 0.9rem; padding: 0.55rem 0.75rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); width: min(360px, 100%); }
.search:focus { outline: none; border-color: var(--accent-text); box-shadow: var(--ring); }
.row { cursor: pointer; }
.ref { font-family: ui-monospace, "Consolas", monospace; font-size: 0.8rem; background: var(--accent-050); color: var(--accent-text); padding: 0.1rem 0.4rem; border-radius: var(--radius-sm); }
.stage { font-weight: 600; }
.empty { text-align: center; padding: 2rem 0; }
</style>
