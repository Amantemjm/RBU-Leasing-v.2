<script setup>
// Supporting documents attached to a transaction. Staff and the linked
// lessee/lessor can upload and download; staff can delete.
import { ref, computed } from "vue";
import { leasingTransactions } from "../lib/resource.js";
import { TRANSACTION_DOCUMENT_TYPES } from "../../../shared/transactionDocuments.js";

const props = defineProps({
  transactionId: { type: String, required: true },
  documents: { type: Array, default: () => [] },
  canUpload: { type: Boolean, default: false },
  canManage: { type: Boolean, default: false },
});
const emit = defineEmits(["changed"]);

const uploading = ref(false);
const error = ref("");
const fileInput = ref(null);

// The named slots come from the shared registry; anything untyped stays in the
// loose list below them.
const slots = computed(() =>
  TRANSACTION_DOCUMENT_TYPES.map((t) => ({
    ...t,
    doc: props.documents.find((d) => d.docType === t.key) || null,
  })),
);
const loose = computed(() => props.documents.filter((d) => !d.docType));

async function onFile(e, docType = null) {
  const file = e.target.files?.[0];
  if (!file) return;
  uploading.value = true; error.value = "";
  try {
    await leasingTransactions.uploadDocument(props.transactionId, file, docType);
    emit("changed");
  } catch (err) {
    error.value = err.response?.data?.error || "Upload failed (PDF, JPG, PNG or DOCX up to 10 MB).";
  } finally {
    uploading.value = false;
    e.target.value = "";
  }
}
function download(doc) {
  leasingTransactions.downloadDocument(props.transactionId, doc.id, doc.filename);
}
async function remove(doc) {
  if (!window.confirm(`Remove "${doc.filename}"?`)) return;
  try { await leasingTransactions.deleteDocument(props.transactionId, doc.id); emit("changed"); }
  catch (err) { error.value = err.response?.data?.error || "Delete failed"; }
}
function fmtSize(b) { return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`; }
function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
</script>

<template>
  <div class="docs">
    <ul class="slots">
      <li v-for="s in slots" :key="s.key" class="slot">
        <div class="slot__head">{{ s.label }}</div>
        <div v-if="s.doc" class="slot__body">
          <button type="button" class="doc__name" @click="download(s.doc)">{{ s.doc.filename }}</button>
          <div class="doc__meta">{{ fmtSize(s.doc.size) }} · {{ s.doc.uploadedByName || "—" }} · {{ fmtDate(s.doc.createdAt) }}</div>
        </div>
        <p v-else class="slot__empty">Not uploaded yet.</p>
        <label v-if="canUpload" class="slot__upload">
          <span>{{ s.doc ? "Replace" : "Upload" }}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" :disabled="uploading" @change="(e) => onFile(e, s.key)" />
        </label>
      </li>
    </ul>

    <div class="loose__head">Other attachments</div>
    <ul v-if="loose.length" class="list">
      <li v-for="d in loose" :key="d.id" class="doc">
        <span class="doc__icon" aria-hidden="true">📄</span>
        <div class="doc__body">
          <button type="button" class="doc__name" @click="download(d)">{{ d.filename }}</button>
          <div class="doc__meta">{{ fmtSize(d.size) }} · {{ d.uploadedByName || "—" }} · {{ fmtDate(d.createdAt) }}</div>
        </div>
        <button type="button" class="doc__dl" title="Download" @click="download(d)">↓</button>
        <button v-if="canManage" type="button" class="doc__del" title="Remove" @click="remove(d)">✕</button>
      </li>
    </ul>
    <p v-else class="empty">No other attachments.</p>

    <div v-if="canUpload" class="upload">
      <input ref="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" @change="(e) => onFile(e, null)" :disabled="uploading" />
      <span v-if="uploading" class="uploading">Uploading…</span>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.slots { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: 0.5rem; }
.slot { display: grid; gap: 0.3rem; padding: 0.6rem 0.7rem; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.slot__head { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
.slot__empty { margin: 0; font-size: 0.85rem; color: var(--faint); }
.slot__upload { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: var(--muted); }
.slot__upload input { font: inherit; font-size: 0.78rem; }
.loose__head { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.4rem; }
.list { list-style: none; margin: 0 0 0.75rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.doc { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.65rem; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.doc__icon { font-size: 1.1rem; }
.doc__body { flex: 1; min-width: 0; }
.doc__name { background: none; border: none; padding: 0; font: inherit; font-weight: 600; font-size: 0.88rem; color: var(--accent-text); cursor: pointer; text-align: left; }
.doc__name:hover { text-decoration: underline; }
.doc__meta { font-size: 0.75rem; color: var(--faint); }
.doc__dl, .doc__del { width: 26px; height: 26px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--surface); cursor: pointer; color: var(--muted); font-size: 0.85rem; line-height: 1; }
.doc__dl:hover { color: var(--accent-text); border-color: var(--accent-text); }
.doc__del:hover { color: var(--danger); border-color: var(--danger); }
.empty { color: var(--muted); font-size: 0.85rem; margin: 0 0 0.6rem; }
.upload { display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; }
.upload input { font: inherit; font-size: 0.82rem; }
.uploading { color: var(--muted); }
</style>
