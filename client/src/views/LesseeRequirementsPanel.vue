<script setup>
// Lessee requirements panel (the "Lessee" tab, and the tenant's own view):
// a tenant uploads + tracks their own documents; staff see every tenant's.
import { ref, onMounted } from "vue";
import { useAuthStore } from "../stores/auth.js";
import { listRequirements, uploadRequirement, downloadRequirement } from "../lib/requirements.js";

const auth = useAuthStore();
const rows = ref([]);
const file = ref(null);
const uploading = ref(false);
const error = ref("");

async function load() { rows.value = await listRequirements(); }
onMounted(load);

function onFile(e) { file.value = e.target.files[0] || null; }
async function submit() {
  if (!file.value) return;
  error.value = "";
  uploading.value = true;
  try {
    await uploadRequirement(file.value);
    file.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Upload failed";
  } finally {
    uploading.value = false;
  }
}
function fmtSize(b) { return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`; }
function fmtDate(iso) { return String(iso).slice(0, 10); }
</script>

<template>
  <div class="lessee-reqs">
    <form v-if="auth.isTenant" class="upload" @submit.prevent="submit">
      <input type="file" @change="onFile" accept=".pdf,.jpg,.jpeg,.png,.docx" />
      <button type="submit" class="primary" :disabled="!file || uploading">Upload</button>
      <span v-if="error" class="error">{{ error }}</span>
    </form>

    <p v-if="rows.length === 0" class="muted">No documents yet.</p>
    <div v-else class="panel panel--table">
      <table>
        <thead>
          <tr>
            <th v-if="!auth.isTenant">Tenant</th>
            <th>File</th><th>Size</th><th>Uploaded</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td v-if="!auth.isTenant">{{ r.tenant?.name || "—" }}</td>
            <td class="filename" :title="r.filename">{{ r.filename }}</td>
            <td>{{ fmtSize(r.size) }}</td>
            <td>{{ fmtDate(r.uploadedAt) }}</td>
            <td><button type="button" class="link" @click="downloadRequirement(r.id, r.filename)">Download</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.upload {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}
.muted { color: var(--muted); }
.filename { color: var(--ink-800); }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; font-weight: 600; }
.link:hover { text-decoration: underline; }
.error { color: var(--danger); font-size: 0.88rem; }
</style>
