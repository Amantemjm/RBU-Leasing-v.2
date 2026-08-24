<script setup>
// Renders an interactive (AcroForm) PDF in-page with PDF.js so the user can edit
// its fields, then export the edited PDF via saveDocument(). Ctrl/⌘+wheel and
// trackpad pinch zoom toward the cursor; a toolbar offers −/+/Fit.
import { onMounted, onBeforeUnmount, ref } from "vue";
import * as pdfjsLib from "pdfjs-dist";
import { EventBus, PDFViewer, PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const props = defineProps({ bytes: { type: [ArrayBuffer, Uint8Array], required: true } });
const emit = defineEmits(["ready", "error"]);

const container = ref(null);
const viewerEl = ref(null);
const zoomPct = ref(100);
let pdfDoc = null;
let pdfViewer = null;

onMounted(async () => {
  try {
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    pdfViewer = new PDFViewer({
      container: container.value, viewer: viewerEl.value, eventBus, linkService,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS, textLayerMode: 0,
    });
    linkService.setViewer(pdfViewer);
    eventBus.on("pagesinit", () => { pdfViewer.currentScaleValue = "page-fit"; syncPct(); });
    eventBus.on("scalechanging", syncPct);
    container.value.addEventListener("wheel", onWheel, { passive: false });

    const buf = props.bytes instanceof Uint8Array ? props.bytes.slice() : props.bytes.slice(0);
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    pdfViewer.setDocument(pdfDoc);
    linkService.setDocument(pdfDoc, null);
    emit("ready");
  } catch (e) { emit("error", e); }
});

function onWheel(e) {
  if (!(e.ctrlKey || e.metaKey) || !pdfViewer) return;
  e.preventDefault();
  const el = container.value; const rect = el.getBoundingClientRect();
  const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
  const prev = pdfViewer.currentScale;
  const next = Math.min(4, Math.max(0.25, prev * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  if (next === prev) return;
  const docX = el.scrollLeft + offX, docY = el.scrollTop + offY;
  pdfViewer.currentScale = next;
  const ratio = next / prev;
  el.scrollLeft = docX * ratio - offX;
  el.scrollTop = docY * ratio - offY;
  syncPct();
}
function syncPct() { if (pdfViewer) zoomPct.value = Math.round(pdfViewer.currentScale * 100); }
function setScale(v) { if (pdfViewer) { pdfViewer.currentScale = Math.min(4, Math.max(0.25, v)); syncPct(); } }
function zoomIn() { setScale((pdfViewer?.currentScale || 1) * 1.15); }
function zoomOut() { setScale((pdfViewer?.currentScale || 1) / 1.15); }
function fitPage() { if (pdfViewer) { pdfViewer.currentScaleValue = "page-fit"; syncPct(); } }
function fitWidth() { if (pdfViewer) { pdfViewer.currentScaleValue = "page-width"; syncPct(); } }

onBeforeUnmount(() => {
  try { container.value?.removeEventListener("wheel", onWheel); } catch { /* ignore */ }
  try { pdfDoc?.destroy?.(); } catch { /* ignore */ }
});

async function getEditedPdf() {
  if (!pdfDoc) throw new Error("The form is still loading. Please wait a moment and try again.");
  return pdfDoc.saveDocument();
}
defineExpose({ getEditedPdf });
</script>

<template>
  <div class="filler">
    <div ref="container" class="pdf-container"><div ref="viewerEl" class="pdfViewer"></div></div>
    <div class="zoom-bar" title="Ctrl + scroll (or pinch) to zoom">
      <button type="button" @click="zoomOut">−</button>
      <span class="pct">{{ zoomPct }}%</span>
      <button type="button" @click="zoomIn">+</button>
      <span class="sep"></span>
      <button type="button" @click="fitPage">Fit page</button>
      <button type="button" @click="fitWidth">Fit width</button>
    </div>
  </div>
</template>

<style scoped>
.filler { position: absolute; inset: 0; }
.pdf-container { position: absolute; inset: 0; overflow: auto; background: var(--paper); }
.zoom-bar {
  position: absolute; top: 10px; right: 12px; z-index: 5; display: flex; align-items: center; gap: 0.25rem;
  background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.2rem 0.35rem; box-shadow: var(--shadow-sm);
}
.zoom-bar button { background: none; border: 0; border-radius: var(--radius-sm); cursor: pointer; padding: 0.25rem 0.5rem; font: inherit; font-size: 0.85rem; color: var(--ink-700); line-height: 1; }
.zoom-bar button:hover { background: var(--paper); }
.zoom-bar .pct { font-size: 0.8rem; color: var(--muted); min-width: 3ch; text-align: center; }
.zoom-bar .sep { width: 1px; height: 1.1rem; background: var(--line-strong); margin: 0 0.15rem; }
</style>
