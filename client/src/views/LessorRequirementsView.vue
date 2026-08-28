<script setup>
import { ref, onMounted, reactive } from "vue";
import { owners, lessorRequirements } from "../lib/resource.js";
import { REQUIREMENT_STATUSES } from "../../../shared/lessorRequirements.js";

const ownerList = ref([]);
const ownerId = ref("");
const rows = ref([]);
const draft = reactive({}); // key -> chosen status
const remark = reactive({}); // key -> remark text
const error = ref("");

onMounted(async () => { ownerList.value = await owners.list(); });

async function loadOwner() {
  if (!ownerId.value) { rows.value = []; return; }
  rows.value = await lessorRequirements.forOwner(ownerId.value);
  rows.value.forEach((r) => { draft[r.requirementKey] = r.status; remark[r.requirementKey] = r.remarks || ""; });
}
async function review(r) {
  error.value = "";
  try {
    await lessorRequirements.review(r.id, { status: draft[r.requirementKey], remarks: remark[r.requirementKey] || null });
    await loadOwner();
  } catch (e) { error.value = e.response?.data?.error || "Review failed"; }
}
async function onFile(e, key) {
  const file = e.target.files?.[0]; if (!file) return;
  try { await lessorRequirements.uploadFor(ownerId.value, key, file); await loadOwner(); }
  catch (err) { error.value = err.response?.data?.error || "Upload failed"; }
  finally { e.target.value = ""; }
}
async function download(row) {
  const blob = await lessorRequirements.download(row.id);
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = row.filename || "document"; a.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <section>
    <header><h1>Lessor Requirements</h1><p class="muted">Review each lessor's document checklist.</p></header>
    <div class="field">
      <label>Lessor</label>
      <select class="owner-picker" v-model="ownerId" @change="loadOwner">
        <option value="">— select a lessor —</option>
        <option v-for="o in ownerList" :key="o.id" :value="o.id">{{ o.name }}</option>
      </select>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <table v-if="rows.length" class="grid">
      <thead><tr><th>Requirement</th><th>Status</th><th>Document</th><th>Review</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.requirementKey">
          <td>{{ r.label }}</td>
          <td><span class="badge">{{ r.status }}</span></td>
          <td>
            <button v-if="r.id && r.filename" type="button" class="link" @click="download(r)">Download</button>
            <label class="upload"><span>Upload</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" @change="onFile($event, r.requirementKey)" /></label>
          </td>
          <td class="review">
            <template v-if="r.id">
              <select class="status-select" v-model="draft[r.requirementKey]">
                <option v-for="s in REQUIREMENT_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
              <input class="remark-input" type="text" v-model="remark[r.requirementKey]" placeholder="Remark (optional)" />
              <button type="button" class="review-btn" @click="review(r)">Save</button>
            </template>
            <span v-else class="muted small">no document yet</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); } .small { font-size: 0.8rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; max-width: 360px; margin-bottom: 1rem; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; margin-right: 0.6rem; }
.upload { font-size: 0.8rem; color: var(--accent-text); cursor: pointer; }
.upload input { display: inline-block; font-size: 0.75rem; }
.review { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.remark-input { font: inherit; font-size: 0.82rem; padding: 0.3rem 0.4rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
.error { color: var(--danger); }
</style>
