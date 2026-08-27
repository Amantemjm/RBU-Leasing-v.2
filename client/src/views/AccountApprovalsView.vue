<script setup>
import { ref, reactive, onMounted } from "vue";
import { pendingAccounts } from "../lib/resource.js";
import { useActionCenter } from "../stores/actionCenter.js";
import { formatDate, roleLabel } from "../lib/formatters.js";

// Keeps the top-bar bell and sidebar badge in step the moment a decision is
// made, rather than leaving a stale count until the next poll.
const actions = useActionCenter();

const rows = ref([]);
const loading = ref(false);
const listError = ref("");
const busy = reactive({}); // id -> true while a decision is in flight

// Rejecting needs a reason, so it opens a small prompt rather than firing
// straight away — an approval is reversible by other means, a rejection is not.
const rejecting = ref(null);
const reason = ref("");
const rejectError = ref("");

async function load() {
  loading.value = true;
  listError.value = "";
  try {
    rows.value = await pendingAccounts.list();
    actions.accountApprovals = rows.value.length;
  } catch (e) {
    listError.value = e.response?.data?.error || "Could not load pending accounts.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function approve(row) {
  if (busy[row.id]) return;
  busy[row.id] = true;
  try {
    await pendingAccounts.approve(row.id);
    await load();
  } catch (e) {
    listError.value = e.response?.data?.error || "Could not approve this account.";
  } finally {
    busy[row.id] = false;
  }
}

function openReject(row) {
  rejecting.value = row;
  reason.value = "";
  rejectError.value = "";
}

async function confirmReject() {
  if (!reason.value.trim()) { rejectError.value = "A reason is required."; return; }
  const row = rejecting.value;
  busy[row.id] = true;
  try {
    await pendingAccounts.reject(row.id, reason.value.trim());
    rejecting.value = null;
    await load();
  } catch (e) {
    rejectError.value = e.response?.data?.error || "Could not reject this account.";
  } finally {
    busy[row.id] = false;
  }
}
</script>

<template>
  <section>
    <div class="head">
      <div>
        <h1>Account Approvals</h1>
        <p class="muted">
          Lessors and lessees who applied through the portal. Approving creates their
          owner or tenant record and lets them sign in.
        </p>
      </div>
      <span v-if="rows.length" class="count">{{ rows.length }} waiting</span>
    </div>

    <p v-if="listError" class="error">{{ listError }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>

    <p v-else-if="!rows.length" class="muted empty">No accounts are waiting for approval.</p>

    <table v-else class="grid">
      <thead>
        <tr><th>Name</th><th>Username</th><th>Email</th><th>Applying as</th><th>Requested</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.name }}</td>
          <td>{{ r.email }}</td>
          <td><a v-if="r.contactEmail" :href="`mailto:${r.contactEmail}`">{{ r.contactEmail }}</a><span v-else class="muted">—</span></td>
          <td><span class="role-tag">{{ roleLabel(r.role) }}</span></td>
          <td>{{ formatDate(r.createdAt) }}</td>
          <td class="row-actions">
            <button type="button" class="link approve" :disabled="busy[r.id]" @click="approve(r)">Approve</button>
            <button type="button" class="link danger" :disabled="busy[r.id]" @click="openReject(r)">Reject</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="rejecting" class="modal-backdrop" @click.self="rejecting = null">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Reject account">
        <h2>Reject {{ rejecting.name }}</h2>
        <p class="muted small">This permanently removes the request; the username is freed so they can apply again later.</p>
        <div class="field">
          <label for="reason">Reason</label>
          <input id="reason" type="text" v-model="reason" placeholder="e.g. Could not verify identity" />
        </div>
        <p v-if="rejectError" class="error">{{ rejectError }}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" @click="rejecting = null">Cancel</button>
          <button type="button" class="primary" :disabled="busy[rejecting.id]" @click="confirmReject">Reject account</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.muted { color: var(--muted); }
.empty { padding: 2rem 0; }
.small { font-size: 0.82rem; }
.count {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
  background: var(--accent-050); color: var(--accent-text);
  padding: 0.25rem 0.6rem; border-radius: 999px; white-space: nowrap;
}
.role-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);
  background: var(--accent-050); color: var(--accent-text);
}
.row-actions { white-space: nowrap; }
.approve { color: var(--good); }
</style>
