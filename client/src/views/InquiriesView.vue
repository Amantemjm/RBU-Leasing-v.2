<script setup>
import { ref, computed, onMounted } from "vue";
import { useAuthStore } from "../stores/auth.js";
import { listInquiries, deleteInquiry, assignInquiry, acceptInquiry, releaseInquiry } from "../lib/inquiries.js";
import { listUsers } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";

const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const isAdmin = computed(() => auth.role === "ADMIN");
const isOfficer = computed(() => auth.role === "LEASING_OFFICER");
const myId = computed(() => auth.user?.id);

const rows = ref([]);
const officers = ref([]); // O-Lease users an admin can assign to
const error = ref("");
const CATEGORY_LABEL = { RESIDENCES: "Residences", OFFICES: "Offices" };
const INQUIRER_LABEL = { LESSOR: "Lessor", LESSEE: "Lessee" };
const STATUS_LABEL = { NEW: "New", IN_PROGRESS: "In Progress", CLOSED: "Closed", CONVERTED: "Converted" };


async function load() {
  error.value = "";
  try {
    rows.value = await listInquiries();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load inquiries";
  }
}
onMounted(async () => {
  await load();
  if (isAdmin.value) {
    try {
      const users = await listUsers();
      officers.value = users.filter((u) => u.role === "LEASING_OFFICER");
    } catch { /* ignore — assignment options just stay empty */ }
  }
});

async function assign(row, assignedToId) {
  try {
    const updated = await assignInquiry(row.id, assignedToId || null);
    row.assignedToId = updated.assignedToId;
    row.assignedTo = updated.assignedTo;
  } catch (e) {
    error.value = e.response?.data?.error || "Could not assign inquiry";
  }
}

// O-Lease self-assign / release.
async function accept(row) {
  error.value = "";
  try {
    const updated = await acceptInquiry(row.id);
    row.assignedToId = updated.assignedToId;
    row.assignedTo = updated.assignedTo;
  } catch (e) {
    error.value = e.response?.data?.error || "Could not accept inquiry";
    await load(); // refresh — it may have been taken by another O-Lease
  }
}
async function release(row) {
  error.value = "";
  try {
    const updated = await releaseInquiry(row.id);
    row.assignedToId = updated.assignedToId;
    row.assignedTo = updated.assignedTo;
  } catch (e) {
    error.value = e.response?.data?.error || "Could not release inquiry";
  }
}

async function remove(row) {
  if (!confirm(`Delete the inquiry from "${row.fullName}"?`)) return;
  try {
    await deleteInquiry(row.id);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Delete failed";
  }
}
</script>

<template>
  <section>
    <header>
      <h1>Inquiries</h1>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead>
        <tr>
          <th>Received</th><th>Status</th><th>Category</th><th>I am a</th><th>Inquiry Type</th><th>Full name</th><th>Email</th>
          <th>Message</th><th>Assigned to</th><th v-if="canWrite"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ formatDate(r.createdAt) }}</td>
          <td><span :class="['status-tag', r.status.toLowerCase().replace('_','-')]">{{ STATUS_LABEL[r.status] || r.status }}</span></td>
          <td><span class="cat-tag">{{ CATEGORY_LABEL[r.category] || r.category }}</span></td>
          <td>{{ INQUIRER_LABEL[r.inquirerType] || r.inquirerType }}</td>
          <td>{{ r.inquiryType }}</td>
          <td>{{ r.fullName }}</td>
          <td><a :href="`mailto:${r.email}`">{{ r.email }}</a></td>
          <td class="msg">{{ r.message }}</td>
          <td class="assign-cell">
            <select
              v-if="isAdmin"
              class="assign-select"
              :value="r.assignedToId || ''"
              @change="(e) => assign(r, e.target.value || null)"
            >
              <option value="">Unassigned</option>
              <option v-for="o in officers" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
            <template v-else-if="isOfficer">
              <span v-if="r.assignedToId === myId" class="mine-wrap">
                <span class="mine">Assigned to you</span>
                <button type="button" class="linkbtn" @click="release(r)">Release</button>
              </span>
              <button v-else-if="!r.assignedToId" type="button" class="accept" @click="accept(r)">Accept</button>
              <span v-else class="muted">{{ r.assignedTo?.name || "Assigned" }}</span>
            </template>
            <span v-else :class="{ muted: !r.assignedTo }">{{ r.assignedTo?.name || "Unassigned" }}</span>
          </td>
          <td v-if="canWrite">
            <button type="button" class="delete" @click="remove(r)">Delete</button>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="canWrite ? 10 : 9" class="muted">No inquiries yet.</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.msg { max-width: 320px; white-space: normal; }
.assign-cell { min-width: 200px; }
.assign-select {
  font: inherit; font-size: 0.85rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.4rem 0.55rem; width: 100%; max-width: 220px; cursor: pointer;
}
.assign-select:focus { outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050); }
.accept {
  background: var(--accent); color: var(--on-accent); border: 1px solid transparent; box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm); padding: 0.35rem 0.85rem; font: inherit; font-size: 0.82rem; font-weight: 550; cursor: pointer;
}
.accept:hover { background: var(--accent-600); }
.mine-wrap { display: inline-flex; align-items: center; gap: 0.6rem; }
.mine { color: var(--accent-text); font-weight: 600; font-size: 0.85rem; }
.linkbtn { background: none; border: 0; padding: 0; color: var(--muted); font: inherit; font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
.linkbtn:hover { color: var(--danger); }
.cat-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);
  background: var(--accent-050); color: var(--accent-text);
}
.status-tag {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;
  padding: 0.15rem 0.45rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
  white-space: nowrap;
}
.status-tag.new { color: var(--accent-text); border-color: var(--accent-text); }
.status-tag.in-progress { color: var(--warn); border-color: var(--warn); }
.status-tag.closed { color: var(--muted); border-color: var(--line); }
.status-tag.converted { color: #fff; background: var(--good); border-color: var(--good); }
</style>
