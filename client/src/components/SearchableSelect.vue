<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";

const props = defineProps({
  modelValue: { default: null }, // selected value, or null
  options: { type: Array, default: () => [] }, // [{ value, label }]
  placeholder: { type: String, default: "Select…" },
  searchPlaceholder: { type: String, default: "Search…" },
  clearLabel: { type: String, default: "— None —" },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const query = ref("");
const root = ref(null);
const searchEl = ref(null);

const selectedLabel = computed(() => {
  const found = props.options.find((o) => o.value === props.modelValue);
  return found ? found.label : "";
});
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter((o) => o.label.toLowerCase().includes(q));
});

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    query.value = "";
    await nextTick();
    searchEl.value?.focus();
  }
}
function choose(value) {
  emit("update:modelValue", value);
  open.value = false;
  query.value = "";
}
function onDoc(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
onMounted(() => document.addEventListener("mousedown", onDoc));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDoc));
</script>

<template>
  <div class="ss" ref="root">
    <button type="button" class="ss__btn" :class="{ open }" @click="toggle">
      <span :class="['ss__val', { placeholder: !selectedLabel }]">{{ selectedLabel || placeholder }}</span>
      <span class="ss__caret" aria-hidden="true">▾</span>
    </button>
    <div v-if="open" class="ss__panel">
      <input
        ref="searchEl"
        class="ss__search"
        v-model="query"
        :placeholder="searchPlaceholder"
        @keydown.esc="open = false"
      />
      <ul class="ss__list">
        <li>
          <button type="button" class="ss__opt clear" @click="choose(null)">{{ clearLabel }}</button>
        </li>
        <li v-for="o in filtered" :key="o.value">
          <button type="button" class="ss__opt" :class="{ sel: o.value === modelValue }" @click="choose(o.value)">
            {{ o.label }}
          </button>
        </li>
        <li v-if="filtered.length === 0" class="ss__empty">No matches</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.ss { position: relative; display: inline-block; min-width: 180px; }
.ss__btn {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 0.4rem; width: 100%;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  padding: 0.4rem 0.6rem; font: inherit; font-size: 0.85rem; cursor: pointer;
}
.ss__btn.open { border-color: var(--accent-text); }
.ss__val.placeholder { color: var(--muted); }
.ss__caret { color: var(--muted); font-size: 0.7rem; }
.ss__panel {
  position: absolute; z-index: 40; top: calc(100% + 0.3rem); left: 0;
  min-width: 100%; max-height: 260px; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16); padding: 0.4rem;
}
.ss__search {
  width: 100%; font: inherit; font-size: 0.85rem; padding: 0.4rem 0.5rem;
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text); margin-bottom: 0.35rem;
}
.ss__search:focus { outline: none; border-color: var(--accent-text); }
.ss__list { list-style: none; margin: 0; padding: 0; }
.ss__opt {
  display: block; width: 100%; text-align: left; background: none; border: none;
  padding: 0.4rem 0.5rem; border-radius: var(--radius-sm); cursor: pointer; font: inherit;
  font-size: 0.85rem; color: var(--text);
}
.ss__opt:hover { background: var(--row-hover); }
.ss__opt.sel { color: var(--accent-text); font-weight: 600; }
.ss__opt.clear { color: var(--muted); }
.ss__empty { color: var(--muted); font-size: 0.8rem; padding: 0.4rem 0.5rem; }
</style>
