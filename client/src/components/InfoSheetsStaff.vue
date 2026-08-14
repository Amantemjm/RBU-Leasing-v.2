<script setup>
import { ref, onMounted } from "vue";
import ConfigurableForm from "./ConfigurableForm.vue";
import SearchableSelect from "./SearchableSelect.vue";
import { formatDate } from "../lib/formatters.js";

const props = defineProps({
  client: { type: Object, required: true },
  parentList: { type: Function, required: true }, // () => Promise<[{id,name}]>
  parentKey: { type: String, required: true }, // "unitOwner" | "tenant"
  parentLabel: { type: String, required: true }, // "Owner" | "Tenant"
  filePrefix: { type: String, required: true },
  title: { type: String, required: true },
});

const STATUS_LABEL = { REQUESTED: "Requested", SUBMITTED: "Submitted", APPROVED: "Approved", RETURNED: "Returned" };

const config = ref(null);
const rows = ref([]);
const parentOptions = ref([]);
const selectedParentId = ref(null);
const error = ref("");
const requesting = ref(false);

const active = ref(null);
const remarks = ref("");
const reviewing = ref(false);

async function load() {
  error.value = "";
  try { rows.value = await props.client.list(); } catch (e) { error.value = e.response?.data?.error || "Could not load sheets"; }
}
onMounted(async () => {
  await load();
  try { config.value = await props.client.config(); } catch { /* ignore */ }
  try { parentOptions.value = (await props.parentList()).map((p) => ({ value: p.id, label: p.name })); } catch { /* ignore */ }
});

async function requestSheet() {
  if (!selectedParentId.value) return;
  error.value = "";
  requesting.value = true;
  try {
    await props.client.create(selectedParentId.value);
    selectedParentId.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not request a sheet";
  } finally {
    requesting.value = false;
  }
}

function openReview(row) { active.value = row; remarks.value = row.remarks || ""; }
function closeReview() { if (!reviewing.value) active.value = null; }
async function decide(status) {
  reviewing.value = true;
  try {
    await props.client.review(active.value.id, { status, remarks: remarks.value || undefined });
    active.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Review failed";
  } finally {
    reviewing.value = false;
  }
}
function download(row) {
  props.client.downloadPdf(row.id, `${props.filePrefix}-${row.id}.pdf`);
}
</script>

<template>
  <section>
    <header><h1>{{ title }}</h1></header>

    <div class="request">
      <SearchableSelect
        v-model="selectedParentId"
        :options="parentOptions"
        :placeholder="`Select ${parentLabel.toLowerCase()}…`"
        :search-placeholder="`Search ${parentLabel.toLowerCase()}…`"
        clear-label="— None —"
      />
      <button type="button" class="primary" :disabled="!selectedParentId || requesting" @click="requestSheet">
        Request sheet
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead>
        <tr><th>{{ parentLabel }}</th><th>Status</th><th>Submitted</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="s in rows" :key="s.id">
          <td>{{ s[parentKey]?.name || "—" }}</td>
          <td><span :class="['status-tag', s.status.toLowerCase()]">{{ STATUS_LABEL[s.status] }}</span></td>
          <td>{{ formatDate(s.submittedAt) || "—" }}</td>
          <td class="actions">
            <button type="button" @click="openReview(s)">{{ s.status === "SUBMITTED" ? "Review" : "View" }}</button>
            <button type="button" @click="download(s)">PDF</button>
          </td>
        </tr>
        <tr v-if="rows.length === 0"><td colspan="4" class="muted">No information sheets yet.</td></tr>
      </tbody>
    </table>

    <div v-if="active" class="modal-backdrop" @click.self="closeReview">
      <div class="modal" role="dialog" aria-modal="true">
        <h2>{{ active[parentKey]?.name }} — <span :class="['status-tag', active.status.toLowerCase()]">{{ STATUS_LABEL[active.status] }}</span></h2>

        <p v-if="active.status === 'REQUESTED'" class="muted">Awaiting submission.</p>
        <ConfigurableForm v-else-if="config" :config="config" :model-value="active.data || {}" readonly />

        <div v-if="active.status === 'SUBMITTED'" class="field">
          <label for="remarks">Remarks (required when returning)</label>
          <textarea id="remarks" rows="2" v-model="remarks"></textarea>
        </div>
        <p v-else-if="active.remarks" class="muted"><strong>Remarks:</strong> {{ active.remarks }}</p>

        <div class="modal-actions">
          <button type="button" class="ghost" @click="closeReview" :disabled="reviewing">Close</button>
          <button type="button" class="ghost" @click="download(active)">Download PDF</button>
          <template v-if="active.status === 'SUBMITTED'">
            <button type="button" class="danger" :disabled="reviewing || !remarks.trim()" @click="decide('RETURNED')">Return</button>
            <button type="button" class="primary" :disabled="reviewing" @click="decide('APPROVED')">Approve</button>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.request { display: flex; align-items: center; gap: 0.6rem; margin: 0.75rem 0 1.25rem; }
.actions { display: flex; gap: 0.5rem; }
.status-tag {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;
  padding: 0.15rem 0.45rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
}
.status-tag.requested { color: var(--warn); border-color: var(--warn); }
.status-tag.submitted { color: var(--accent-text); border-color: var(--accent-text); }
.status-tag.approved { color: #fff; background: var(--good); border-color: var(--good); }
.status-tag.returned { color: var(--danger); border-color: var(--danger); }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 22, 33, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem; z-index: 50;
}
.modal {
  background: var(--surface); border-radius: var(--radius); padding: 1.5rem;
  width: 100%; max-width: 52rem; max-height: 85vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}
.modal h2 { margin: 0 0 1rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.5rem 0; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: var(--muted); }
.field textarea {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.55rem 0.65rem; width: 100%; resize: vertical;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.75rem; flex-wrap: wrap; }
.primary { background: var(--accent); color: #fff; border: 1px solid transparent; box-shadow: var(--shadow-sm); border-radius: var(--radius-sm); padding: 0.55rem 1rem; font: inherit; font-weight: 550; cursor: pointer; }
.primary:hover { background: var(--accent-600); }
.primary:disabled, .danger:disabled { opacity: 0.55; cursor: not-allowed; }
.ghost { background: var(--surface); color: var(--ink-700); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.55rem 1rem; font: inherit; cursor: pointer; }
.danger { background: var(--surface); color: var(--danger); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.55rem 1rem; font: inherit; font-weight: 550; cursor: pointer; }
.danger:hover:not(:disabled) { background: var(--danger-050); }
</style>
