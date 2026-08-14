<script setup>
import { ref, computed, onMounted } from "vue";
import { useAuthStore } from "../stores/auth.js";
import { listInquiries, deleteInquiry, assignInquiry } from "../lib/inquiries.js";
import { listUsers } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";
import SearchableSelect from "../components/SearchableSelect.vue";

const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const isAdmin = computed(() => auth.role === "ADMIN");

const rows = ref([]);
const officers = ref([]); // O-Lease users an admin can assign to
const error = ref("");
const CATEGORY_LABEL = { RESIDENCES: "Residences", OFFICES: "Offices" };
const INQUIRER_LABEL = { LESSOR: "Lessor", LESSEE: "Lessee" };

const officerOptions = computed(() => officers.value.map((o) => ({ value: o.id, label: o.name })));

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
          <th>Received</th><th>Category</th><th>I am a</th><th>Inquiry Type</th><th>Full name</th><th>Email</th>
          <th>Message</th><th>Assigned to</th><th v-if="canWrite"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ formatDate(r.createdAt) }}</td>
          <td><span class="cat-tag">{{ CATEGORY_LABEL[r.category] || r.category }}</span></td>
          <td>{{ INQUIRER_LABEL[r.inquirerType] || r.inquirerType }}</td>
          <td>{{ r.inquiryType }}</td>
          <td>{{ r.fullName }}</td>
          <td><a :href="`mailto:${r.email}`">{{ r.email }}</a></td>
          <td class="msg">{{ r.message }}</td>
          <td class="assign-cell">
            <SearchableSelect
              v-if="isAdmin"
              :model-value="r.assignedToId || null"
              :options="officerOptions"
              placeholder="Unassigned"
              search-placeholder="Search O-Lease…"
              clear-label="— Unassign —"
              @update:model-value="(val) => assign(r, val)"
            />
            <span v-else :class="{ muted: !r.assignedTo }">{{ r.assignedTo?.name || "Unassigned" }}</span>
          </td>
          <td v-if="canWrite">
            <button type="button" class="delete" @click="remove(r)">Delete</button>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="canWrite ? 9 : 8" class="muted">No inquiries yet.</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.msg { max-width: 320px; white-space: normal; }
.assign-cell { min-width: 200px; }
.cat-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);
  background: var(--accent-050); color: var(--accent-text);
}
</style>
