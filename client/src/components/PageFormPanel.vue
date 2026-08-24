<script setup>
// Renders the Super Admin-configured custom fields for the current user's role
// on a given page (the "slot"). If nothing is configured for this role + page,
// the component renders nothing, so host pages are unaffected until an admin
// configures fields.
import { ref, computed, onMounted } from "vue";
import { myPageForm } from "../lib/resource.js";
import ConfigurableForm from "./ConfigurableForm.vue";

const props = defineProps({
  pageKey: { type: String, required: true },
});

const loaded = ref(false);
const title = ref("");
const fields = ref([]);
const model = ref({});
const saving = ref(false);
const savedAt = ref("");
const error = ref("");

const hasForm = computed(() => fields.value.length > 0);
const config = computed(() => ({ sections: [{ title: title.value, fields: fields.value }] }));

onMounted(async () => {
  try {
    const res = await myPageForm.get(props.pageKey);
    title.value = res.title || "Additional information";
    fields.value = res.fields || [];
    if (res.data) model.value = res.data;
  } catch {
    // Non-fatal: if we can't load, just render nothing.
  } finally {
    loaded.value = true;
  }
});

async function save() {
  error.value = "";
  saving.value = true;
  try {
    const res = await myPageForm.save(props.pageKey, model.value);
    savedAt.value = new Date().toLocaleTimeString();
    if (res.data) model.value = res.data;
  } catch (e) {
    error.value = e.response?.data?.error || "Could not save your answers.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="loaded && hasForm" class="pfp">
    <ConfigurableForm :config="config" v-model="model" />
    <div class="pfp__actions">
      <span v-if="savedAt" class="pfp__saved">Saved {{ savedAt }}</span>
      <button type="button" class="primary" :disabled="saving" @click="save">
        {{ saving ? "Saving…" : "Save" }}
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.pfp { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; margin-top: 1.5rem; }
.pfp__actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.9rem; margin-top: 0.5rem; }
.pfp__saved { color: var(--muted); font-size: 0.82rem; }
</style>
