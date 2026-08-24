<script setup>
// Counts up to a numeric value on mount and whenever it changes. Accepts a
// number or a string with a numeric part (e.g. "88%") — the prefix/suffix are
// preserved and only the number animates. Honours prefers-reduced-motion.
import { ref, watch, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  value: { type: [Number, String], default: 0 },
  duration: { type: Number, default: 900 },
});

function parse(v) {
  const s = String(v ?? "");
  const m = s.match(/-?\d[\d,]*\.?\d*/);
  if (!m) return { prefix: s, target: null, suffix: "", decimals: 0 };
  const raw = m[0].replace(/,/g, "");
  return {
    prefix: s.slice(0, m.index),
    suffix: s.slice(m.index + m[0].length),
    target: parseFloat(raw),
    decimals: (raw.split(".")[1] || "").length,
  };
}

const display = ref(String(props.value ?? ""));
let raf = null;
const reduce = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

function format(n, decimals) {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function run(v) {
  const { prefix, suffix, target, decimals } = parse(v);
  if (target === null || reduce) { display.value = String(v ?? ""); return; }
  const start = performance.now();
  const from = 0;
  cancelAnimationFrame(raf);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / props.duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const cur = from + (target - from) * eased;
    display.value = `${prefix}${format(cur, decimals)}${suffix}`;
    if (t < 1) raf = requestAnimationFrame(tick);
    else display.value = `${prefix}${format(target, decimals)}${suffix}`;
  };
  raf = requestAnimationFrame(tick);
}

onMounted(() => run(props.value));
watch(() => props.value, (v) => run(v));
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template><span>{{ display }}</span></template>
