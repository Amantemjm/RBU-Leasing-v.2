<script setup>
import { ref, computed, onMounted } from "vue";
import ConfigurableForm from "./ConfigurableForm.vue";
import { formatDate } from "../lib/formatters.js";

const props = defineProps({
  client: { type: Object, required: true }, // { config, list, submit, downloadPdf }
  filePrefix: { type: String, required: true },
});

const STATUS_LABEL = { REQUESTED: "Requested", SUBMITTED: "Submitted", APPROVED: "Approved", RETURNED: "Returned" };

const config = ref(null);
const sheet = ref(null);
const formData = ref({});
const loading = ref(true);
const error = ref("");
const submitting = ref(false);

const editable = computed(() => sheet.value && ["REQUESTED", "RETURNED"].includes(sheet.value.status));
const requiredKeys = computed(() =>
  (config.value?.sections || []).flatMap((s) => s.fields).filter((f) => f.required).map((f) => f.key),
);
const canSubmit = computed(() => requiredKeys.value.every((k) => String(formData.value[k] ?? "").trim() !== ""));

async function load() {
  loading.value = true;
  error.value = "";
  try {
    config.value = await props.client.config();
    const rows = await props.client.list();
    sheet.value = rows[0] || null;
    formData.value = sheet.value?.data || {};
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
    sheet.value = await props.client.submit(sheet.value.id, formData.value);
    formData.value = sheet.value.data || {};
  } catch (e) {
    error.value = e.response?.data?.error || "Submit failed";
  } finally {
    submitting.value = false;
  }
}
function download() {
  props.client.downloadPdf(sheet.value.id, `${props.filePrefix}-${sheet.value.id}.pdf`);
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
        <button type="button" class="ghost pdf" @click="download">Download PDF</button>
      </div>

      <p v-if="sheet.status === 'RETURNED' && sheet.remarks" class="returned">
        <strong>Returned for revision:</strong> {{ sheet.remarks }}
      </p>

      <ConfigurableForm
        v-if="config"
        :config="config"
        :model-value="sheet.data || {}"
        :readonly="!editable"
        @update:model-value="formData = $event"
      />

      <form v-if="editable" @submit.prevent="submit">
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="primary" :disabled="!canSubmit || submitting">
          {{ submitting ? "Submitting…" : "Submit information sheet" }}
        </button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.status-line { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.status-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
  padding: 0.18rem 0.5rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
}
.status-tag.requested { color: var(--warn); border-color: var(--warn); }
.status-tag.submitted { color: var(--accent-text); border-color: var(--accent-text); }
.status-tag.approved { color: #fff; background: var(--good); border-color: var(--good); }
.status-tag.returned { color: var(--danger); border-color: var(--danger); }
.pdf { margin-left: auto; }
.returned {
  background: var(--danger-050); border: 1px solid var(--danger); border-radius: var(--radius-sm);
  padding: 0.6rem 0.85rem; margin-bottom: 1.25rem; font-size: 0.9rem;
}
.primary {
  background: var(--accent); color: #fff; border: 1px solid transparent; box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm); padding: 0.65rem 1.1rem; font: inherit; font-weight: 550; cursor: pointer; margin-top: 0.5rem;
}
.primary:hover { background: var(--accent-600); }
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.ghost {
  background: var(--surface); color: var(--ink-700); border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm); padding: 0.5rem 0.9rem; font: inherit; font-size: 0.85rem; cursor: pointer;
}
.ghost:hover { background: var(--paper); border-color: var(--muted); }
</style>
