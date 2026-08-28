<script setup>
// Read-only card shown to a party (owner/tenant) on their portal landing view,
// summarizing their next scheduled site visits (Unit Inspection, Key Turnover,
// Photoshoot) across all of their leasing transactions.
import { ref, onMounted } from "vue";
import { appointments } from "../lib/resource.js";
import { stageByKey } from "../../../shared/leasingStages.js";
import { formatDate } from "../lib/formatters.js";

const UPCOMING_STATUSES = ["Scheduled", "Rescheduled"];

const rows = ref([]);

async function load() {
  try {
    const all = await appointments.mine();
    rows.value = (all || [])
      .filter((a) => UPCOMING_STATUSES.includes(a.status))
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  } catch {
    rows.value = [];
  }
}
onMounted(load);

function stageLabel(key) {
  return stageByKey(key)?.label || key;
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function statusClass(s) {
  if (s === "Rescheduled") return "warn";
  return "pending";
}
</script>

<template>
  <div class="panel upcoming">
    <div class="panel__label">Upcoming appointment</div>
    <p v-if="!rows.length" class="muted">No upcoming appointments.</p>
    <ul v-else class="list">
      <li v-for="row in rows" :key="row.id" class="appt">
        <div class="appt__top">
          <span class="badge" :class="statusClass(row.status)">{{ row.status }}</span>
          <span class="appt__stage">{{ stageLabel(row.stage) }}</span>
        </div>
        <div class="appt__when">{{ formatDate(row.scheduledAt) }} · {{ formatTime(row.scheduledAt) }}</div>
        <dl class="meta">
          <div v-if="row.location"><dt>Location</dt><dd>{{ row.location }}</dd></div>
          <div v-if="row.notes"><dt>Notes</dt><dd>{{ row.notes }}</dd></div>
          <div v-if="row.transaction?.reference"><dt>Reference</dt><dd>{{ row.transaction.reference }}</dd></div>
        </dl>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm); margin-bottom: 1.1rem; }
.panel__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; margin-bottom: 0.75rem; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.9rem; }
.appt:not(:last-child) { padding-bottom: 0.9rem; border-bottom: 1px solid var(--line); }
.appt__top { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.3rem; }
.appt__stage { font-weight: 600; }
.appt__when { font-size: 0.9rem; color: var(--ink-700); margin-bottom: 0.5rem; }

.badge { font-size: 0.66rem; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--paper); color: var(--muted); border: 1px solid var(--line); }
.badge.warn { background: var(--warn-050); color: var(--warn); border-color: var(--warn); }
.badge.pending { background: var(--accent-050); color: var(--accent-text); border-color: var(--accent-text); }

.meta { margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.meta > div { display: grid; grid-template-columns: 6rem 1fr; gap: 0.5rem; }
.meta dt { color: var(--muted); font-size: 0.82rem; }
.meta dd { margin: 0; font-size: 0.9rem; }
</style>
