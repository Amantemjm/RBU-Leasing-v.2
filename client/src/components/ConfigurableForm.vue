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
    if (f.type === "checkboxes") form[f.key] = Array.isArray(v) ? [...v] : [];
    else if (f.type === "date") form[f.key] = toDateInput(v);
    else form[f.key] = v ?? "";
    if (f.allowOther) form[`${f.key}Other`] = data?.[`${f.key}Other`] ?? "";
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

// choice helpers ---------------------------------------------------------
function pickRadio(field, opt) {
  if (props.readonly) return;
  form[field.key] = form[field.key] === opt ? "" : opt;
  if (field.allowOther) form[`${field.key}Other`] = "";
}
function onOtherInput(field) {
  if (field.type === "radio") form[field.key] = ""; // other is exclusive with the options
}
// Image uploads: we only track the chosen file name (enough for the builder
// preview and for a readonly summary); binary handling is a feature concern.
function onImage(field, event) {
  if (props.readonly) return;
  const file = event.target.files?.[0];
  form[field.key] = file ? file.name : "";
}
function toggleCheckbox(field, opt) {
  if (props.readonly) return;
  const arr = form[field.key] || [];
  const i = arr.indexOf(opt);
  form[field.key] = i === -1 ? [...arr, opt] : arr.filter((x) => x !== opt);
}
function isChecked(field, opt) {
  return field.type === "checkboxes" ? (form[field.key] || []).includes(opt) : form[field.key] === opt;
}

function display(field) {
  const v = form[field.key];
  if (field.type === "checkboxes") {
    const parts = [...(v || [])];
    if (field.allowOther && form[`${field.key}Other`]) parts.push(form[`${field.key}Other`]);
    return parts.length ? parts.join(", ") : "—";
  }
  if (v === "" || v == null) {
    if (field.allowOther && form[`${field.key}Other`]) return form[`${field.key}Other`];
    return "—";
  }
  return field.type === "date" ? String(v).slice(0, 10) : String(v);
}
</script>

<template>
  <div class="cfg">
    <div v-for="section in config.sections" :key="section.title" class="group">
      <h2>{{ section.title }}</h2>
      <div class="grid">
        <div
          v-for="f in section.fields"
          :key="f.key"
          class="field"
          :class="{ wide: f.type === 'textarea' || f.type === 'checkboxes' || (f.type === 'radio' && f.options.length > 3) }"
        >
          <label :for="f.key">{{ f.label }} <span v-if="f.required" class="req">*</span></label>

          <!-- radio / checkboxes render as tick-boxes in both edit and readonly -->
          <template v-if="f.type === 'radio' || f.type === 'checkboxes'">
            <div class="choices" :class="{ ro: readonly }">
              <button
                v-for="opt in optionsFor(f)"
                :key="opt"
                type="button"
                class="choice"
                :class="{ on: isChecked(f, opt) }"
                :disabled="readonly"
                @click="f.type === 'checkboxes' ? toggleCheckbox(f, opt) : pickRadio(f, opt)"
              >
                <span class="tick">{{ isChecked(f, opt) ? "☑" : "☐" }}</span>{{ opt }}
              </button>
              <span v-if="f.allowOther" class="choice other">
                <span class="tick">{{ form[`${f.key}Other`] ? "☑" : "☐" }}</span>
                <span v-if="f.otherLabel" class="other-label">{{ f.otherLabel }}:</span>
                <input
                  :id="f.key"
                  v-model="form[`${f.key}Other`]"
                  :readonly="readonly"
                  class="other-input"
                  type="text"
                  @input="onOtherInput(f)"
                />
              </span>
            </div>
          </template>

          <template v-else-if="readonly">
            <div class="ro-value">{{ display(f) }}</div>
          </template>

          <template v-else>
            <textarea v-if="f.type === 'textarea'" :id="f.key" rows="3" v-model="form[f.key]" :placeholder="f.placeholder || ''"></textarea>
            <select
              v-else-if="f.type === 'select'"
              :id="f.key"
              v-model="form[f.key]"
              @change="f.source === 'estates' ? onEstateChange() : null"
            >
              <option value="">—</option>
              <option v-for="opt in optionsFor(f)" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <div v-else-if="f.type === 'image'" class="imgfield">
              <input :id="f.key" type="file" accept="image/*" @change="onImage(f, $event)" />
              <span v-if="form[f.key]" class="imgfield__name">{{ form[f.key] }}</span>
            </div>
            <input v-else :id="f.key" :type="f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'" v-model="form[f.key]" :placeholder="f.placeholder || ''" />
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
.imgfield { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.imgfield input[type="file"] { border: none; padding: 0; font-size: 0.9rem; }
.imgfield__name { font-size: 0.85rem; color: var(--muted); }

/* choice groups (radio / checkboxes) */
.choices { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; align-items: center; }
.choice {
  display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-size: 0.9rem;
  background: none; border: none; padding: 0.15rem 0; color: var(--text); cursor: pointer;
}
.choice .tick { font-size: 1.05rem; line-height: 1; color: var(--muted); }
.choice.on { color: var(--accent-text); font-weight: 550; }
.choice.on .tick { color: var(--accent-text); }
.choice:disabled { cursor: default; }
.choice.other { cursor: default; }
.other-label { color: var(--muted); }
.other-input {
  width: auto; min-width: 8rem; flex: 0 1 12rem; padding: 0.3rem 0.45rem !important; font-size: 0.9rem !important;
}
.choices.ro .choice { cursor: default; }
</style>
