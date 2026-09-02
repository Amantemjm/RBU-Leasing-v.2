<script setup>
// Lessor requirements panel (the "Lessor" tab of the Requirements module):
// pick a lessor, see their 7-item checklist, view/download each uploaded file,
// upload on behalf, and review each requirement's status.
import { ref, onMounted, reactive } from "vue";
import { owners, lessorRequirements } from "../lib/resource.js";
import { REQUIREMENT_STATUSES } from "../../../shared/lessorRequirements.js";

const ownerList = ref([]);
const ownerId = ref("");
const rows = ref([]);
const draft = reactive({}); // key -> chosen status
const remark = reactive({}); // key -> remark text
const expiry = reactive({}); // key -> expiry date (YYYY-MM-DD)
const error = ref("");

onMounted(async () => { ownerList.value = await owners.list(); });

async function loadOwner() {
  if (!ownerId.value) { rows.value = []; return; }
  rows.value = await lessorRequirements.forOwner(ownerId.value);
  rows.value.forEach((r) => {
    draft[r.requirementKey] = r.status;
    remark[r.requirementKey] = r.remarks || "";
    expiry[r.requirementKey] = r.expiresAt ? String(r.expiresAt).slice(0, 10) : "";
  });
}
async function review(r) {
  error.value = "";
  try {
    const exp = expiry[r.requirementKey];
    await lessorRequirements.review(r.id, {
      status: draft[r.requirementKey],
      remarks: remark[r.requirementKey] || null,
      expiresAt: exp ? new Date(exp).toISOString() : null,
    });
    await loadOwner();
  } catch (e) { error.value = e.response?.data?.error || "Review failed"; }
}
async function onFile(e, key) {
  const file = e.target.files?.[0]; if (!file) return;
  try { await lessorRequirements.uploadFor(ownerId.value, key, file); await loadOwner(); }
  catch (err) { error.value = err.response?.data?.error || "Upload failed"; }
  finally { e.target.value = ""; }
}
async function view(row) {
  const blob = await lessorRequirements.download(row.id);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function download(row) {
  const blob = await lessorRequirements.download(row.id);
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = row.filename || "document"; a.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="lessor-reqs">
    <div class="field">
      <label>Lessor</label>
      <select class="owner-picker" v-model="ownerId" @change="loadOwner">
        <option value="">— select a lessor —</option>
        <option v-for="o in ownerList" :key="o.id" :value="o.id">{{ o.name }}</option>
      </select>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!ownerId" class="muted">Select a lessor to see their document checklist.</p>

    <div v-if="rows.length" class="panel panel--table">
      <table class="grid">
        <thead><tr><th>Requirement</th><th>Status</th><th>Document</th><th>Review</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.requirementKey">
            <td>{{ r.label }}</td>
            <td><span class="badge">{{ r.status }}</span></td>
            <td class="doc">
              <template v-if="r.id && r.filename">
                <span class="filename" :title="r.filename">{{ r.filename }}</span>
                <span class="doc-actions">
                  <button type="button" class="link" @click="view(r)">View</button>
                  <button type="button" class="link" @click="download(r)">Download</button>
                </span>
              </template>
              <span v-else class="muted small">No file yet</span>
              <label class="upload"><span>{{ r.id && r.filename ? "Replace" : "Upload" }}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" @change="onFile($event, r.requirementKey)" /></label>
            </td>
            <td class="review">
              <template v-if="r.id">
                <select class="status-select" v-model="draft[r.requirementKey]">
                  <option v-for="s in REQUIREMENT_STATUSES" :key="s" :value="s">{{ s }}</option>
                </select>
                <input class="remark-input" type="text" v-model="remark[r.requirementKey]" placeholder="Remark (optional)" />
                <input class="expiry-input" type="date" v-model="expiry[r.requirementKey]" />
                <button type="button" class="review-btn secondary" @click="review(r)">Save</button>
              </template>
              <span v-else class="muted small">no document yet</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); } .small { font-size: 0.8rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; max-width: 360px; margin-bottom: 1rem; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: var(--muted); }
.owner-picker { padding: 0.5rem 0.7rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); font: inherit; color: var(--text); }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.doc { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
.filename { font-size: 0.83rem; color: var(--ink-800); max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-actions { display: flex; gap: 0.6rem; }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; font-weight: 600; }
.link:hover { text-decoration: underline; }
.upload { font-size: 0.78rem; color: var(--accent-text); cursor: pointer; }
.upload input { display: inline-block; font-size: 0.72rem; }
.review { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.status-select, .remark-input, .expiry-input { font: inherit; font-size: 0.82rem; padding: 0.3rem 0.4rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }
.review-btn { padding: 0.4rem 0.8rem; font-size: 0.82rem; }
.error { color: var(--danger); }
</style>
