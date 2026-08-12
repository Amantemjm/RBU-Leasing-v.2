<script setup>
import { ref, computed, onMounted } from "vue";
import { useAuthStore } from "../stores/auth.js";
import { listInquiries, updateInquiryStatus, deleteInquiry } from "../lib/inquiries.js";
import { formatDate } from "../lib/formatters.js";

const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));

const rows = ref([]);
const error = ref("");
const STATUSES = ["NEW", "IN_PROGRESS", "CLOSED"];
const CATEGORY_LABEL = { RESIDENCES: "Residences", OFFICES: "Offices" };
const STATUS_LABEL = { NEW: "New", IN_PROGRESS: "In progress", CLOSED: "Closed" };

async function load() {
  error.value = "";
  try {
    rows.value = await listInquiries();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load inquiries";
  }
}
onMounted(load);

async function changeStatus(row, status) {
  try {
    const updated = await updateInquiryStatus(row.id, status);
    row.status = updated.status;
  } catch (e) {
    error.value = e.response?.data?.error || "Could not update status";
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
          <th>Received</th><th>Category</th><th>Full name</th><th>Email</th>
          <th>Message</th><th>Status</th><th v-if="canWrite"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ formatDate(r.createdAt) }}</td>
          <td><span class="cat-tag">{{ CATEGORY_LABEL[r.category] || r.category }}</span></td>
          <td>{{ r.fullName }}</td>
          <td><a :href="`mailto:${r.email}`">{{ r.email }}</a></td>
          <td class="msg">{{ r.message }}</td>
          <td>
            <select
              v-if="canWrite"
              class="status"
              :value="r.status"
              @change="(e) => changeStatus(r, e.target.value)"
            >
              <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
            </select>
            <span v-else :class="['status-tag', r.status.toLowerCase()]">{{ STATUS_LABEL[r.status] || r.status }}</span>
          </td>
          <td v-if="canWrite">
            <button type="button" class="delete" @click="remove(r)">Delete</button>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="canWrite ? 7 : 6" class="muted">No inquiries yet.</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.msg { max-width: 320px; white-space: normal; }
.cat-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);
  background: var(--accent-050); color: var(--accent-text);
}
.status { font-family: inherit; font-size: 0.85rem; padding: 0.35rem 0.5rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }
.status-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
  padding: 0.15rem 0.45rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
}
.status-tag.new { color: var(--accent-text); border-color: var(--accent-text); }
</style>
