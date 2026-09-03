<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import ConfigurableForm from "./ConfigurableForm.vue";
import PdfPreview from "./PdfPreview.vue";
import PdfFormFiller from "./PdfFormFiller.vue";
import PdfViewer from "./PdfViewer.vue";
import { formatDate } from "../lib/formatters.js";

const props = defineProps({
  client: { type: Object, required: true },
  filePrefix: { type: String, required: true },
});

const STATUS_LABEL = { REQUESTED: "Requested", SUBMITTED: "Submitted", APPROVED: "Approved", RETURNED: "Returned" };

const config = ref(null);
const sheet = ref(null);
const formData = ref({});
const loading = ref(true);
const error = ref("");
const submitting = ref(false);
const mode = ref("fill"); // "fill" | "upload"

// fill-mode live preview
const previewBytes = ref(null);
let previewTimer = null;

// upload-mode state
const pdfBytes = ref(null);        // working PDF in the editor
const uploadedBytes = ref(null);   // truthy when the form was/will be submitted as a PDF
const reloadKey = ref(0);
const editorReady = ref(false);
const editorFailed = ref(false);
const saving = ref(false);
const saveMsg = ref("");
const actionError = ref("");
const filler = ref(null);

const editable = computed(() => sheet.value && ["REQUESTED", "RETURNED"].includes(sheet.value.status));
const isPdfSubmission = computed(() => !!uploadedBytes.value);
const requiredKeys = computed(() =>
  (config.value?.sections || []).flatMap((s) => s.fields).filter((f) => f.required).map((f) => f.key),
);
const canSubmit = computed(() => requiredKeys.value.every((k) => {
  const v = formData.value[k];
  return Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "";
}));

async function load() {
  loading.value = true; error.value = "";
  try {
    config.value = await props.client.config();
    const rows = await props.client.list();
    sheet.value = rows[0] || null;
    formData.value = sheet.value?.data || {};
    if (sheet.value) {
      // If a PDF is already stored, this form uses the upload/edit path.
      let bytes = null;
      try { bytes = await props.client.filledPdfBytes(sheet.value.id); } catch { /* none */ }
      if (bytes) { uploadedBytes.value = bytes; pdfBytes.value = bytes; mode.value = "upload"; }
      else refreshPreview();
    }
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load your acceptance form";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => clearTimeout(previewTimer));

// ---- fill mode ----------------------------------------------------------
async function refreshPreview() {
  try { previewBytes.value = await props.client.previewBytes(formData.value); } catch { /* keep last */ }
}
function onFormUpdate(v) {
  formData.value = v;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 450);
}
async function submit() {
  if (!canSubmit.value) return;
  error.value = ""; submitting.value = true;
  try {
    sheet.value = await props.client.submit(sheet.value.id, formData.value);
    formData.value = sheet.value.data || {};
    uploadedBytes.value = null; // data submission
    refreshPreview();
  } catch (e) {
    error.value = e.response?.data?.error || "Submit failed";
  } finally {
    submitting.value = false;
  }
}

// ---- upload & edit mode -------------------------------------------------
function setMode(m) {
  mode.value = m;
  if (m === "fill" && !previewBytes.value) refreshPreview();
}
function resetEditor() { editorReady.value = false; editorFailed.value = false; reloadKey.value += 1; }
async function onUpload(e) {
  actionError.value = ""; saveMsg.value = "";
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) { actionError.value = "Please choose a PDF file."; return; }
  saving.value = true;
  try {
    await props.client.savePdf(sheet.value.id, f);
    pdfBytes.value = await props.client.filledPdfBytes(sheet.value.id);
    resetEditor();
  } catch (err) {
    actionError.value = err.response?.data?.error || "Could not upload the form";
  } finally {
    saving.value = false;
  }
}
async function currentBytes() {
  if (!editorFailed.value && filler.value) return filler.value.getEditedPdf();
  return pdfBytes.value;
}
async function saveDraft() {
  actionError.value = ""; saveMsg.value = ""; saving.value = true;
  try {
    await props.client.savePdf(sheet.value.id, await filler.value.getEditedPdf());
    saveMsg.value = "Saved";
  } catch (err) {
    actionError.value = err.response?.data?.error || err.message || "Could not save";
  } finally { saving.value = false; }
}
async function submitPdf() {
  actionError.value = ""; saveMsg.value = ""; submitting.value = true;
  try {
    const bytes = await currentBytes();
    sheet.value = await props.client.submitFilledPdf(sheet.value.id, bytes);
    uploadedBytes.value = bytes; // PDF submission
  } catch (err) {
    actionError.value = err.response?.data?.error || err.message || "Could not submit the form";
  } finally { submitting.value = false; }
}
function onFillerError() { editorFailed.value = true; }
function startOver() { pdfBytes.value = null; editorReady.value = false; editorFailed.value = false; saveMsg.value = ""; actionError.value = ""; }
function fallbackUrl() { return Promise.resolve(URL.createObjectURL(new Blob([pdfBytes.value], { type: "application/pdf" }))); }

function download() { props.client.downloadPdf(sheet.value.id, `${props.filePrefix}-${sheet.value.id}.pdf`); }
function downloadUploaded() { props.client.downloadFilledPdf(sheet.value.id, `${props.filePrefix}-${sheet.value.id}.pdf`); }
</script>

<template>
  <section class="acc">
    <header class="head">
      <h1>Acceptance Form</h1>
      <div v-if="sheet && !loading" class="status-line">
        <div v-if="editable" class="seg">
          <button type="button" :class="{ on: mode === 'fill' }" @click="setMode('fill')">Fill in Acceptance Form</button>
          <button type="button" :class="{ on: mode === 'upload' }" @click="setMode('upload')">Upload Acceptance Form</button>
        </div>
        <span :class="['status-tag', sheet.status.toLowerCase()]">{{ STATUS_LABEL[sheet.status] }}</span>
        <span v-if="sheet.status === 'SUBMITTED'" class="muted">Submitted {{ formatDate(sheet.submittedAt) }} — awaiting review.</span>
        <span v-else-if="sheet.status === 'APPROVED'" class="muted">Approved {{ formatDate(sheet.reviewedAt) }}.</span>
        <button type="button" class="ghost" @click="isPdfSubmission ? downloadUploaded() : download()">Download PDF</button>
      </div>
    </header>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!sheet" class="muted">No acceptance form has been requested for you yet.</p>

    <template v-else>
      <p v-if="sheet.status === 'RETURNED' && sheet.remarks" class="returned">
        <strong>Returned for revision:</strong> {{ sheet.remarks }}
      </p>

      <!-- ============ EDITABLE ============ -->
      <template v-if="editable">
        <!-- FILL MODE -->
        <template v-if="mode === 'fill'">
          <p class="lead">Type in the fields on the left — your entries appear in the form preview on the right. Submit when done.</p>
          <div class="split">
            <div class="pane form-pane">
              <ConfigurableForm v-if="config" :config="config" :model-value="sheet.data || {}" @update:model-value="onFormUpdate" />
              <div class="actions">
                <button type="button" class="primary" :disabled="!canSubmit || submitting" @click="submit">
                  {{ submitting ? "Submitting…" : "Submit acceptance form" }}
                </button>
              </div>
            </div>
            <div class="pane preview-pane"><PdfPreview :bytes="previewBytes" /></div>
          </div>
        </template>

        <!-- UPLOAD & EDIT MODE -->
        <template v-else>
          <template v-if="!pdfBytes">
            <p class="lead">Upload your acceptance form (PDF) — e.g. the one your leasing officer provided — then edit it here and submit.</p>
            <input type="file" accept="application/pdf,.pdf" class="file-input" :disabled="saving" @change="onUpload" />
            <p v-if="actionError" class="error">{{ actionError }}</p>
          </template>
          <template v-else>
            <div class="edit-toolbar">
              <p class="lead">Edit the form below, then submit for review.</p>
              <div class="actions inline">
                <span v-if="saveMsg" class="saved">{{ saveMsg }}</span>
                <button type="button" class="ghost" :disabled="saving || submitting" @click="startOver">Start over</button>
                <input type="file" accept="application/pdf,.pdf" class="file-input sm" title="Replace with another PDF" @change="onUpload" />
                <button v-if="!editorFailed" type="button" class="ghost" :disabled="!editorReady || saving || submitting" @click="saveDraft">
                  {{ saving ? "Saving…" : "Save" }}
                </button>
                <button type="button" class="primary" :disabled="(!editorReady && !editorFailed) || submitting" @click="submitPdf">
                  {{ submitting ? "Submitting…" : "Submit for review" }}
                </button>
              </div>
            </div>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <p v-if="editorFailed" class="notice">In-page editing isn’t available in this browser. You can still submit the uploaded form, or replace it.</p>
            <div class="pdf-stage">
              <PdfFormFiller v-if="!editorFailed" :key="reloadKey" ref="filler" :bytes="pdfBytes" @ready="editorReady = true" @error="onFillerError" />
              <PdfViewer v-else :key="`fb-${reloadKey}`" :load="fallbackUrl" title="Uploaded acceptance form" />
            </div>
          </template>
        </template>
      </template>

      <!-- ============ SUBMITTED / APPROVED (read-only) ============ -->
      <template v-else>
        <div v-if="isPdfSubmission" class="pdf-stage tall">
          <PdfViewer :load="() => client.filledPdfUrl(sheet.id)" title="Submitted acceptance form" />
        </div>
        <div v-else class="split">
          <div class="pane form-pane"><ConfigurableForm v-if="config" :config="config" :model-value="sheet.data || {}" readonly /></div>
          <div class="pane preview-pane"><PdfPreview :bytes="previewBytes" /></div>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.acc { display: flex; flex-direction: column; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.head h1 { margin: 0; }
.muted { color: var(--muted); }
.lead { color: var(--muted); font-size: 0.92rem; margin: 0.5rem 0 1rem; }
.status-line { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.status-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
  padding: 0.18rem 0.5rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
}
.status-tag.requested { color: var(--warn); border-color: var(--warn); }
.status-tag.submitted { color: var(--accent-text); border-color: var(--accent-text); }
.status-tag.approved { color: #fff; background: var(--good); border-color: var(--good); }
.status-tag.returned { color: var(--danger); border-color: var(--danger); }
.returned { background: var(--danger-050); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.6rem 0.85rem; margin-bottom: 1rem; font-size: 0.9rem; }
.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); overflow: hidden; margin: 0; }
.seg button { background: var(--surface); border: 0; padding: 0.45rem 0.95rem; font: inherit; font-size: 0.88rem; cursor: pointer; color: var(--ink-700); }
.seg button + button { border-left: 1px solid var(--line-strong); }
.seg button.on { background: var(--accent); color: var(--on-accent); }
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.pane { min-width: 0; }
.form-pane { max-height: calc(100vh - 260px); overflow: auto; padding-right: 0.25rem; }
.preview-pane { height: calc(100vh - 260px); min-height: 480px; position: sticky; top: 0; border: 1px solid var(--line-strong); border-radius: var(--radius); overflow: hidden; background: var(--paper); }
.pdf-stage { position: relative; height: calc(100vh - 250px); min-height: 520px; border: 1px solid var(--line-strong); border-radius: var(--radius); overflow: hidden; background: var(--paper); }
.pdf-stage.tall { height: calc(100vh - 200px); }
.file-input { font: inherit; font-size: 0.9rem; color: var(--muted); }
.file-input::file-selector-button { background: var(--accent); color: var(--on-accent); border: 1px solid transparent; box-shadow: var(--shadow-sm); border-radius: var(--radius-sm); padding: 0.5rem 0.95rem; margin-right: 0.65rem; font: inherit; font-weight: 550; cursor: pointer; }
.file-input::file-selector-button:hover { background: var(--accent-600); }
.file-input.sm::file-selector-button { background: var(--surface); color: var(--ink-700); border: 1px solid var(--line-strong); box-shadow: none; padding: 0.4rem 0.75rem; font-weight: 400; font-size: 0.82rem; }
.edit-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.actions { margin-top: 1rem; }
.actions.inline { margin: 0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.saved { color: var(--good); font-size: 0.85rem; }
.notice { background: var(--paper); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.55rem 0.8rem; margin-bottom: 0.75rem; font-size: 0.88rem; color: var(--ink-700); }
.primary { background: var(--accent); color: var(--on-accent); border: 1px solid transparent; box-shadow: var(--shadow-sm); border-radius: var(--radius-sm); padding: 0.6rem 1.1rem; font: inherit; font-weight: 550; cursor: pointer; }
.primary:hover { background: var(--accent-600); }
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.ghost { background: var(--surface); color: var(--ink-700); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.45rem 0.85rem; font: inherit; font-size: 0.85rem; cursor: pointer; }
.ghost:hover:not(:disabled) { background: var(--paper); border-color: var(--muted); }
.ghost:disabled { opacity: 0.55; cursor: not-allowed; }
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } .preview-pane { position: static; height: 60vh; } }
</style>
