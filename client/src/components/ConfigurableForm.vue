<script setup>
import { reactive, ref, computed, watch, onMounted } from "vue";
import { estates as estatesApi } from "../lib/resource.js";
import { toDateInput } from "../lib/formatters.js";

const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const allFields = computed(() => props.config.sections.flatMap((s) => s.fields));
const estateField = computed(() => allFields.value.find((f) => f.source === "estates"));
const towerField = computed(() => allFields.value.find((f) => f.source === "towers"));

const estateList = ref([]); // [{ id, name, towers:[{id,name}] }]
const form = reactive({});

function seed(data) {
  for (const f of allFields.value) {
    const v = data?.[f.key];
    form[f.key] = f.type === "date" ? toDateInput(v) : (v ?? "");
  }
}
watch(() => props.modelValue, (mv) => seed(mv), { immediate: true });
watch(form, () => emit("update:modelValue", { ...form }), { deep: true });

onMounted(async () => {
  if (allFields.value.some((f) => f.source)) {
    try { estateList.value = await estatesApi.list(); } catch { /* options stay empty */ }
  }
});

// select options, resolving dynamic estate/tower sources
function optionsFor(field) {
  if (field.source === "estates") return estateList.value.map((e) => e.name);
  if (field.source === "towers") {
    const est = estateList.value.find((e) => e.name === form[estateField.value?.key]);
    return (est?.towers || []).map((t) => t.name);
  }
  return field.options || [];
}
function onEstateChange() {
  if (towerField.value) form[towerField.value.key] = "";
}
function display(field) {
  const v = form[field.key];
  if (v === "" || v == null) return "—";
  return field.type === "date" ? String(v).slice(0, 10) : String(v);
}
</script>

<template>
  <div class="cfg">
    <div v-for="section in config.sections" :key="section.title" class="group">
      <h2>{{ section.title }}</h2>
      <div class="grid">
        <div v-for="f in section.fields" :key="f.key" class="field" :class="{ wide: f.type === 'textarea' }">
          <label :for="f.key">{{ f.label }} <span v-if="f.required" class="req">*</span></label>

          <template v-if="readonly">
            <div class="ro-value">{{ display(f) }}</div>
          </template>
          <template v-else>
            <textarea v-if="f.type === 'textarea'" :id="f.key" rows="3" v-model="form[f.key]"></textarea>
            <select
              v-else-if="f.type === 'select'"
              :id="f.key"
              v-model="form[f.key]"
              @change="f.source === 'estates' ? onEstateChange() : null"
            >
              <option value="">—</option>
              <option v-for="opt in optionsFor(f)" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input v-else :id="f.key" :type="f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'" v-model="form[f.key]" />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group { margin-bottom: 1.75rem; }
.group h2 {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-text);
  font-weight: 700; margin: 0 0 0.75rem; padding-bottom: 0.35rem; border-bottom: 1px solid var(--line);
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field.wide { grid-column: 1 / -1; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: var(--muted); }
.req { color: var(--danger); }
.field input, .field select, .field textarea {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.55rem 0.65rem; width: 100%;
}
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050);
}
.ro-value { font-size: 0.95rem; padding: 0.15rem 0; }
</style>
