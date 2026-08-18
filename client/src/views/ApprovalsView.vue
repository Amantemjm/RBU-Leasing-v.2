<script setup>
import { ref, computed, onMounted } from "vue";
import { units, approveUnit, rejectUnit } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";

// Only the Super Admin can approve/reject; others see a read-only pending list.
const auth = useAuthStore();
const canWrite = computed(() => auth.role === "ADMIN");
const rows = ref([]);
async function load() { rows.value = await units.list({ approvalStatus: "PENDING" }); }
onMounted(load);

async function decide(id, approve) {
  try {
    await (approve ? approveUnit(id) : rejectUnit(id));
    await load();
  } catch (e) {
    alert(e.response?.data?.error || "Failed");
  }
}
</script>

<template>
  <section>
    <h1>Pending unit approvals</h1>
    <p v-if="rows.length === 0" class="muted">No units awaiting approval.</p>
    <table v-else>
      <thead>
        <tr><th>Unit #</th><th>Tower</th><th>Owner</th><th>Monthly rent</th><th v-if="canWrite">Actions</th></tr>
      </thead>
      <tbody>
        <tr v-for="u in rows" :key="u.id">
          <td>{{ u.unitNumber }}</td>
          <td>{{ u.tower?.name || "—" }}</td>
          <td>{{ u.owner?.name || "—" }}</td>
          <td>{{ formatPHP(u.baseRent) }}</td>
          <td v-if="canWrite">
            <button type="button" class="approve" @click="decide(u.id, true)">Approve</button>
            <button type="button" class="reject" @click="decide(u.id, false)">Reject</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.approve { color: var(--good); border-color: var(--good) !important; }
.approve:hover { background: var(--good-050); }
.reject { color: var(--danger); }
.reject:hover { background: var(--danger-050); border-color: var(--danger) !important; }
.muted { color: var(--muted); }
</style>
