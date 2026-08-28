<script setup>
import { ref, onMounted } from "vue";
import { lessorRequirements } from "../lib/resource.js";

const rows = ref([]);
const busyKey = ref("");
const error = ref("");
const ACTIONABLE = ["Required", "Rejected", "For Resubmission", "Expired"];

async function load() { rows.value = await lessorRequirements.mine(); }
onMounted(load);

async function onFile(e, key) {
  const file = e.target.files?.[0];
  if (!file) return;
  busyKey.value = key; error.value = "";
  try { await lessorRequirements.uploadMine(key, file); await load(); }
  catch (err) { error.value = err.response?.data?.error || "Upload failed"; }
  finally { busyKey.value = ""; e.target.value = ""; }
}
async function download(row) {
  const blob = await lessorRequirements.download(row.id);
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = row.filename || "document"; a.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <section>
    <header><h1>My Requirements</h1><p class="muted">Upload the documents O-Lease needs. Track each one's status here.</p></header>
    <p v-if="error" class="error">{{ error }}</p>
    <ul class="list">
      <li v-for="r in rows" :key="r.requirementKey" class="item">
        <div class="item__main">
          <span class="item__label">{{ r.label }}</span>
          <span class="badge" :class="r.status.toLowerCase().replace(/ /g,'-')">{{ r.status }}</span>
        </div>
        <div v-if="r.remarks" class="remark">{{ r.remarks }}</div>
        <div class="item__actions">
          <button v-if="r.id && r.filename" type="button" class="link" @click="download(r)">Download</button>
          <label v-if="ACTIONABLE.includes(r.status)" class="upload">
            <span>{{ r.id && r.filename ? "Replace" : "Upload" }}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" :disabled="busyKey === r.requirementKey" @change="onFile($event, r.requirementKey)" />
          </label>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.item { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.75rem 0.9rem; }
.item__main { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.item__label { font-weight: 600; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.badge.rejected, .badge.expired, .badge.for-resubmission { background: var(--danger-050); color: var(--danger); }
.badge.approved { background: var(--good-050); color: var(--good); }
.badge.required { background: var(--paper); color: var(--muted); }
.remark { font-size: 0.82rem; color: var(--danger); margin-top: 0.3rem; }
.item__actions { display: flex; align-items: center; gap: 0.9rem; margin-top: 0.5rem; }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; }
.upload { font-size: 0.85rem; color: var(--accent-text); cursor: pointer; }
.upload input { display: block; font-size: 0.8rem; margin-top: 0.2rem; }
.error { color: var(--danger); }
</style>
