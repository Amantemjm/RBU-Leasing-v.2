<script setup>
import { ref, onMounted } from "vue";
import { listAudit } from "../lib/audit.js";
import { roleLabel, formatDate } from "../lib/formatters.js";

const rows = ref([]);
const error = ref("");

function when(iso) {
  const time = String(iso).slice(11, 16); // HH:mm
  return `${formatDate(iso)}${time ? " · " + time : ""}`;
}

onMounted(async () => {
  try {
    rows.value = await listAudit();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load the audit trail";
  }
});
</script>

<template>
  <section>
    <header><h1>Audit Trail</h1></header>
    <p class="muted">Every action taken in the system, and who took it (most recent first).</p>

    <p v-if="error" class="error">{{ error }}</p>
    <div class="panel panel--table">
    <table>
      <thead>
        <tr><th>When</th><th>Who</th><th>Role</th><th>Action</th><th>Entity</th><th>Target</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td class="nowrap">{{ when(r.createdAt) }}</td>
          <td>{{ r.actorName || "—" }}</td>
          <td>{{ r.actorRole ? roleLabel(r.actorRole) : "—" }}</td>
          <td><span class="tag">{{ r.action }}</span></td>
          <td>{{ r.entity }}</td>
          <td class="mono">{{ r.entityId || "—" }}</td>
        </tr>
        <tr v-if="rows.length === 0"><td colspan="6" class="muted">No activity recorded yet.</td></tr>
      </tbody>
    </table>
    </div>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.nowrap { white-space: nowrap; }
.mono { font-family: ui-monospace, "Cascadia Code", "Consolas", monospace; font-size: 0.8rem; color: var(--muted); }
.tag {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
  padding: 0.12rem 0.42rem; border-radius: var(--radius-sm); background: var(--accent-050); color: var(--accent-text);
}
</style>
