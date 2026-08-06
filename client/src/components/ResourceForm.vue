<script setup>
import { reactive, watch } from "vue";

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, default: () => ({}) },
  error: { type: String, default: "" },
  submitting: { type: Boolean, default: false },
});
const emit = defineEmits(["submit", "cancel"]);

const form = reactive({});
function seed(record) {
  for (const f of props.fields) {
    form[f.key] = record?.[f.key] ?? "";
  }
}
seed(props.modelValue);
watch(() => props.modelValue, seed, { deep: true });

function onSubmit() {
  // Omit empty-string fields (e.g. an untouched optional select on its
  // placeholder) so they are not sent as "" — the API's enum/number schemas
  // reject "", and omitting lets optional fields fall back to their defaults.
  const values = {};
  for (const [key, value] of Object.entries(form)) {
    if (value !== "" && value !== null && value !== undefined) values[key] = value;
  }
  emit("submit", values);
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div v-for="f in fields" :key="f.key" class="field">
      <label :for="f.key">{{ f.label }}</label>
      <select v-if="f.type === 'select'" :id="f.key" v-model="form[f.key]">
        <option value="">— select —</option>
        <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input v-else :id="f.key" :type="f.type" v-model="form[f.key]" />
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit" :disabled="submitting">Save</button>
    <button type="button" class="cancel" @click="emit('cancel')">Cancel</button>
  </form>
</template>
