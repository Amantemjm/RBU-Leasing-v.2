<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units, submitUnit } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";

const rows = ref([]);
const router = useRouter();
const busy = ref({});
async function load() { rows.value = await units.list(); }
onMounted(load);
const editable = (u) => ["DRAFT", "REJECTED"].includes(u.approvalStatus);
async function submit(u) {
  if (busy.value[u.id]) return;
  busy.value = { ...busy.value, [u.id]: true };
  try { await submitUnit(u.id); await load(); } finally { busy.value = { ...busy.value, [u.id]: false }; }
}
</script>

<template>
  <section>
    <header>
      <h1>My Units</h1>
      <button type="button" @click="router.push('/app/register-unit')">Register a unit</button>
    </header>
    <table class="grid">
      <thead><tr><th>Unit #</th><th>Tower</th><th>Type</th><th>Monthly Rent</th><th>Approval</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in rows" :key="u.id">
          <td>{{ u.unitNumber }}</td>
          <td>{{ u.tower?.name || "—" }}</td>
          <td>{{ u.type }}</td>
          <td>{{ formatPHP(u.baseRent) }}</td>
          <td>
            <span class="badge" :class="u.approvalStatus.toLowerCase()">{{ u.approvalStatus }}</span>
            <div v-if="u.approvalStatus === 'REJECTED' && u.reviewRemarks" class="remark">{{ u.reviewRemarks }}</div>
          </td>
          <td class="actions">
            <button v-if="editable(u)" type="button" class="link" @click="router.push(`/app/register-unit?id=${u.id}`)">Edit</button>
            <button v-if="editable(u)" type="button" class="link submit" :disabled="busy[u.id]" @click="submit(u)">Submit</button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="6" class="muted">No units yet.</td></tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.badge { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.badge.rejected { background: var(--danger-050); color: var(--danger); }
.badge.draft { background: var(--paper); color: var(--muted); }
.remark { font-size: 0.8rem; color: var(--danger); margin-top: 0.25rem; }
.actions { white-space: nowrap; }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0.2rem 0.4rem; }
.muted { color: var(--muted); }
</style>
