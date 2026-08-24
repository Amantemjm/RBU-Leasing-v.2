<script setup>
// Renders PDF bytes to canvases (read-only), re-rendering smoothly whenever the
// bytes change — used for the live form preview. Preserves scroll on update.
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const props = defineProps({
  bytes: { type: [ArrayBuffer, Uint8Array], default: null },
});

const stage = ref(null);
const pageList = ref([]); // [{ num, wPx, hPx }]
const canvases = [];
let renderToken = 0;
let scale = 1;

function fitScale(baseWidthPt) {
  const avail = (stage.value?.clientWidth || 700) - 24;
  return Math.min(1.5, Math.max(0.5, avail / baseWidthPt));
}

function destroyTask(task) { try { task?.destroy?.(); } catch { /* ignore */ } }

async function render(bytes) {
  const token = ++renderToken;
  if (!bytes) { pageList.value = []; return; }
  const data = bytes instanceof Uint8Array ? bytes.slice() : bytes.slice(0);
  const task = pdfjsLib.getDocument({ data });
  let pdf;
  try {
    pdf = await task.promise;
  } catch { destroyTask(task); return; }
  if (token !== renderToken) { destroyTask(task); return; }

  scale = fitScale((await pdf.getPage(1)).getViewport({ scale: 1 }).width);
  const infos = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const vp = (await pdf.getPage(n)).getViewport({ scale });
    infos.push({ num: n, wPx: Math.round(vp.width), hPx: Math.round(vp.height) });
  }
  if (token !== renderToken) { destroyTask(task); return; }
  pageList.value = infos;
  await nextTick();
  for (let i = 0; i < infos.length; i++) {
    if (token !== renderToken) break;
    const page = await pdf.getPage(infos[i].num);
    const vp = page.getViewport({ scale });
    const cv = canvases[i];
    if (!cv) continue;
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
  }
  destroyTask(task);
}

watch(() => props.bytes, (b) => render(b));
onMounted(() => { if (props.bytes) render(props.bytes); });
onBeforeUnmount(() => { renderToken++; });
</script>

<template>
  <div ref="stage" class="preview">
    <p v-if="!pageList.length" class="muted">Your form preview will appear here as you fill in the fields.</p>
    <div v-for="(pg, i) in pageList" :key="pg.num" class="page" :style="{ width: pg.wPx + 'px', height: pg.hPx + 'px' }">
      <canvas :ref="(el) => (canvases[i] = el)"></canvas>
    </div>
  </div>
</template>

<style scoped>
.preview { height: 100%; overflow: auto; background: var(--paper); padding: 12px; }
.muted { color: var(--muted); font-size: 0.9rem; padding: 1rem; text-align: center; }
.page { position: relative; margin: 0 auto 12px; box-shadow: var(--shadow-sm); background: #fff; }
.page canvas { display: block; }
</style>
