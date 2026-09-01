<script setup>
import { ref, computed, onMounted } from "vue";
import { units, approveUnit, rejectUnit } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";

// Only the Super Admin can approve/reject; others see a read-only submitted list.
const auth = useAuthStore();
const canWrite = computed(() => auth.role === "ADMIN");
const rows = ref([]);
async function load() { rows.value = await units.list({ approvalStatus: "SUBMITTED" }); }
onMounted(load);

async function approve(id) {
  try {
    await approveUnit(id);
    await load();
  } catch (e) {
    alert(e.response?.data?.error || "Failed");
  }
}

// Rejecting needs a remark, so it opens a small modal rather than firing
// straight away — an approval is reversible by other means, a rejection is not.
const rejecting = ref(null);
const reason = ref("");
const rejectError = ref("");

function openReject(row) {
  rejecting.value = row;
  reason.value = "";
  rejectError.value = "";
}

async function confirmReject() {
  if (!reason.value.trim()) { rejectError.value = "A remark is required."; return; }
  const row = rejecting.value;
  try {
    await rejectUnit(row.id, reason.value.trim());
    rejecting.value = null;
    await load();
  } catch (e) {
    rejectError.value = e.response?.data?.error || "Failed";
  }
}
</script>

<template>
  <section>
    <h1>Submitted unit approvals</h1>
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
            <button type="button" class="primary" @click="approve(u.id)">Approve</button>
            <button type="button" class="danger" @click="openReject(u)">Reject</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="rejecting" class="modal-backdrop" @click.self="rejecting = null">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Reject unit">
        <h2>Reject unit {{ rejecting.unitNumber }}</h2>
        <p class="muted small">This sends the unit back to the owner/officer with your remark.</p>
        <div class="field">
          <label for="remark">Remark</label>
          <input id="remark" type="text" v-model="reason" placeholder="e.g. Missing supporting documents" />
        </div>
        <p v-if="rejectError" class="error">{{ rejectError }}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" @click="rejecting = null">Cancel</button>
          <button type="button" class="primary" @click="confirmReject">Reject unit</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.approve { color: var(--good); border-color: var(--good) !important; }
.approve:hover { background: var(--good-050); }
.reject { color: var(--danger); }
.reject:hover { background: var(--danger-050); border-color: var(--danger) !important; }
.muted { color: var(--muted); }
.small { font-size: 0.82rem; }
</style>
