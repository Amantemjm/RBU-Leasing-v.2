<script setup>
// Read-only, in-system PDF preview. `load` returns an object URL (fetched with
// auth), rendered in the browser's native PDF viewer via an iframe.
import { ref, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  load: { type: Function, required: true }, // async () => objectUrl
  title: { type: String, default: "Document" },
});

const url = ref("");
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try { url.value = await props.load(); } catch { error.value = "Could not load the PDF."; } finally { loading.value = false; }
});
onBeforeUnmount(() => { if (url.value) { try { URL.revokeObjectURL(url.value); } catch { /* ignore */ } } });
</script>

<template>
  <div class="pdf-view">
    <p v-if="loading" class="muted pad">Loading…</p>
    <p v-else-if="error" class="error pad">{{ error }}</p>
    <iframe v-else :src="url" :title="title" class="frame"></iframe>
  </div>
</template>

<style scoped>
.pdf-view { width: 100%; height: 100%; }
.frame { width: 100%; height: 100%; border: 0; }
.pad { padding: 1rem; }
.muted { color: var(--muted); }
</style>
