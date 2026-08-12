<script setup>
import { reactive, ref, computed, onMounted } from "vue";
import { listInfoSheets, submitInfoSheet } from "../lib/infoSheets.js";
import { INFO_SHEET_GROUPS, INFO_SHEET_KEYS, INFO_SHEET_REQUIRED } from "../lib/infoSheetFields.js";
import { formatDate, toDateInput } from "../lib/formatters.js";

const STATUS_LABEL = { REQUESTED: "Requested", SUBMITTED: "Submitted", APPROVED: "Approved", RETURNED: "Returned" };

const sheet = ref(null);
const loading = ref(true);
const error = ref("");
const submitting = ref(false);
const form = reactive(Object.fromEntries(INFO_SHEET_KEYS.map((k) => [k, ""])));

const editable = computed(() => sheet.value && ["REQUESTED", "RETURNED"].includes(sheet.value.status));
const canSubmit = computed(() => INFO_SHEET_REQUIRED.every((k) => String(form[k] || "").trim() !== ""));

function fillForm(s) {
  for (const k of INFO_SHEET_KEYS) {
    form[k] = k === "birthdate" ? toDateInput(s[k]) : (s[k] ?? "");
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const rows = await listInfoSheets();
    sheet.value = rows[0] || null;
    if (sheet.value) fillForm(sheet.value);
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load your information sheet";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function submit() {
  if (!canSubmit.value) return;
  error.value = "";
  submitting.value = true;
  try {
    sheet.value = await submitInfoSheet(sheet.value.id, { ...form });
  } catch (e) {
    error.value = e.response?.data?.error || "Submit failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section>
    <header><h1>Information Sheet</h1></header>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!sheet" class="muted">No information sheet has been requested for you yet.</p>

    <template v-else>
      <div class="status-line">
        <span :class="['status-tag', sheet.status.toLowerCase()]">{{ STATUS_LABEL[sheet.status] }}</span>
        <span v-if="sheet.status === 'SUBMITTED'" class="muted">Submitted {{ formatDate(sheet.submittedAt) }} — awaiting review.</span>
        <span v-else-if="sheet.status === 'APPROVED'" class="muted">Approved {{ formatDate(sheet.reviewedAt) }}.</span>
      </div>

      <p v-if="sheet.status === 'RETURNED' && sheet.remarks" class="returned">
        <strong>Returned for revision:</strong> {{ sheet.remarks }}
      </p>

      <!-- Editable form (REQUESTED / RETURNED) -->
      <form v-if="editable" @submit.prevent="submit">
        <div v-for="g in INFO_SHEET_GROUPS" :key="g.title" class="group">
          <h2>{{ g.title }}</h2>
          <div class="grid">
            <div v-for="f in g.fields" :key="f.key" class="field">
              <label :for="f.key">{{ f.label }} <span v-if="f.required" class="req">*</span></label>
              <input :id="f.key" :type="f.type || 'text'" v-model="form[f.key]" />
            </div>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="primary" :disabled="!canSubmit || submitting">
          {{ submitting ? "Submitting…" : "Submit information sheet" }}
        </button>
      </form>

      <!-- Read-only (SUBMITTED / APPROVED) -->
      <div v-else class="readonly">
        <div v-for="g in INFO_SHEET_GROUPS" :key="g.title" class="group">
          <h2>{{ g.title }}</h2>
          <dl class="grid">
            <div v-for="f in g.fields" :key="f.key" class="ro-field">
              <dt>{{ f.label }}</dt>
              <dd>{{ f.type === "date" ? (formatDate(sheet[f.key]) || "—") : (sheet[f.key] || "—") }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.status-line { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.status-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
  padding: 0.18rem 0.5rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
}
.status-tag.requested { color: var(--warn); border-color: var(--warn); }
.status-tag.submitted { color: var(--accent-text); border-color: var(--accent-text); }
.status-tag.approved { color: #fff; background: var(--good); border-color: var(--good); }
.status-tag.returned { color: var(--danger); border-color: var(--danger); }
.returned {
  background: var(--danger-050); border: 1px solid var(--danger); border-radius: var(--radius-sm);
  padding: 0.6rem 0.85rem; margin-bottom: 1.25rem; font-size: 0.9rem;
}
.group { margin-bottom: 1.75rem; }
.group h2 {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-text);
  font-weight: 700; margin: 0 0 0.75rem; padding-bottom: 0.35rem; border-bottom: 1px solid var(--line);
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: var(--muted); }
.field input {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.55rem 0.65rem; width: 100%;
}
.field input:focus { outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050); }
.req { color: var(--danger); }
.ro-field dt { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
.ro-field dd { margin: 0.15rem 0 0; font-size: 0.95rem; }
.primary {
  background: var(--accent); color: #fff; border: 1px solid transparent; box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm); padding: 0.65rem 1.1rem; font: inherit; font-weight: 550; cursor: pointer;
}
.primary:hover { background: var(--accent-600); }
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.readonly dl { margin: 0; }
</style>
