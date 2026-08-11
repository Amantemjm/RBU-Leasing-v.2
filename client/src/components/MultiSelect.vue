<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, default: () => [] }, // [{ value, label }]
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const root = ref(null);

const summary = computed(() =>
  props.modelValue.length === 0 ? "All" : `${props.modelValue.length} selected`,
);

function isChecked(value) {
  return props.modelValue.includes(value);
}
function toggle(value) {
  const next = isChecked(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value];
  emit("update:modelValue", next);
}
function selectAll() {
  emit("update:modelValue", props.options.map((o) => o.value));
}
function clear() {
  emit("update:modelValue", []);
}

function onDocMouseDown(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
onMounted(() => document.addEventListener("mousedown", onDocMouseDown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocMouseDown));
</script>

<template>
  <div class="ms" ref="root">
    <button type="button" class="ms__btn" :class="{ open }" @click="open = !open">
      <span class="ms__lbl">{{ label }}:</span>
      <span class="ms__sum">{{ summary }}</span>
      <span class="ms__caret" aria-hidden="true">▾</span>
    </button>
    <div v-if="open" class="ms__panel">
      <div class="ms__actions">
        <button type="button" @click="selectAll">Select all</button>
        <button type="button" @click="clear">Clear</button>
      </div>
      <label v-for="o in options" :key="o.value" class="ms__opt">
        <input type="checkbox" :checked="isChecked(o.value)" @change="toggle(o.value)" />
        <span>{{ o.label }}</span>
      </label>
      <p v-if="options.length === 0" class="ms__empty">No options</p>
    </div>
  </div>
</template>

<style scoped>
.ms { position: relative; display: inline-block; }
.ms__btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: var(--surface); color: var(--ink-800, inherit);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  padding: 0.45rem 0.75rem; font: inherit; font-size: 0.85rem; cursor: pointer;
}
.ms__btn.open { border-color: var(--accent); }
.ms__lbl { color: var(--muted); }
.ms__sum { font-weight: 600; }
.ms__caret { color: var(--muted); font-size: 0.7rem; }
.ms__panel {
  position: absolute; z-index: 40; top: calc(100% + 0.3rem); left: 0;
  min-width: 220px; max-height: 300px; overflow-y: auto;
  background: var(--surface, #fff); border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
  padding: 0.5rem;
}
.ms__actions { display: flex; gap: 0.5rem; padding: 0.15rem 0.35rem 0.5rem; border-bottom: 1px solid var(--line); margin-bottom: 0.35rem; }
.ms__actions button {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--accent); font: inherit; font-size: 0.78rem; font-weight: 600;
}
.ms__opt { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.35rem; border-radius: var(--radius-sm); cursor: pointer; }
.ms__opt:hover { background: rgba(0, 0, 0, 0.04); }
.ms__opt input { margin: 0; }
.ms__empty { color: var(--muted); font-size: 0.8rem; padding: 0.35rem; margin: 0; }
</style>
