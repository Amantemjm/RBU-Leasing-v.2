<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { pageForms } from "../lib/resource.js";
import { pageFormSlot, ROLE_LABELS } from "../../../shared/pageForms.js";
import { formatDate } from "../lib/formatters.js";
import ConfigurableForm from "../components/ConfigurableForm.vue";

const route = useRoute();
const router = useRouter();

const role = route.params.role;
const pageKey = route.params.pageKey;
const slot = pageFormSlot(role, pageKey);
const roleLabel = ROLE_LABELS[role] || role;

const FIELD_TYPES = [
  { value: "text", label: "Free text" },
  { value: "textarea", label: "Paragraph" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Single choice" },
  { value: "checkboxes", label: "Multiple choice" },
  { value: "image", label: "Image upload" },
];
const CHOICE_TYPES = ["select", "radio", "checkboxes"];
const PLACEHOLDER_TYPES = ["text", "textarea", "number", "email", "tel"];
const isChoice = (t) => CHOICE_TYPES.includes(t);
const supportsPlaceholder = (t) => PLACEHOLDER_TYPES.includes(t);

const loading = ref(true);
const loadError = ref("");
const saving = ref(false);
const saveError = ref("");
const savedAt = ref("");

const meta = reactive({ title: "" });
const fields = ref([]);
// The field definitions as last persisted on the server (with their real keys).
// Submissions are keyed by these, so we read them against this — not the live,
// possibly-unsaved editor state.
const serverFields = ref([]);
let uid = 0;

const tab = ref("build"); // build | submissions
const entries = ref([]);
const entriesLoaded = ref(false);

function newField() {
  return { _id: ++uid, label: "", type: "text", required: false, placeholder: "", optionsText: "" };
}

onMounted(async () => {
  if (!slot) { loadError.value = "This isn't a configurable page."; loading.value = false; return; }
  try {
    const data = await pageForms.get(role, pageKey);
    meta.title = data?.title || "";
    serverFields.value = data?.fields || [];
    fields.value = (data?.fields || []).map((f) => ({
      _id: ++uid,
      label: f.label || "",
      type: f.type || "text",
      required: !!f.required,
      placeholder: f.placeholder || "",
      optionsText: (f.options || []).join("\n"),
    }));
  } catch (e) {
    loadError.value = e.response?.data?.error || "Could not load this page's form";
  } finally {
    loading.value = false;
  }
});

function addField() { fields.value.push(newField()); }
function removeField(i) { fields.value.splice(i, 1); }
function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= fields.value.length) return;
  const arr = fields.value;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function optionsOf(f) {
  return f.optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
}
function normalized(list) {
  const seen = new Set();
  return list.map((f, i) => {
    let base = slugify(f.label) || `field-${i + 1}`;
    let key = base;
    let n = 2;
    while (seen.has(key)) key = `${base}-${n++}`;
    seen.add(key);
    const out = { key, label: f.label, type: f.type, required: f.required };
    if (supportsPlaceholder(f.type) && f.placeholder) out.placeholder = f.placeholder;
    out.options = isChoice(f.type) ? optionsOf(f) : [];
    return out;
  });
}

const previewFields = computed(() => normalized(fields.value.filter((f) => f.label.trim())));
const previewConfig = computed(() => ({
  sections: [{ title: meta.title || slot?.label || "Preview", fields: previewFields.value }],
}));
const previewKey = computed(() =>
  JSON.stringify(previewFields.value.map((f) => [f.key, f.type, f.required, f.options.length])),
);
const previewModel = ref({});

const validationError = computed(() => {
  for (const f of fields.value) {
    if (!f.label.trim()) return "Every field needs a label.";
    if (isChoice(f.type) && optionsOf(f).length === 0) {
      return `“${f.label.trim()}” is a choice field — add at least one option.`;
    }
  }
  return "";
});

async function save() {
  saveError.value = "";
  if (validationError.value) { saveError.value = validationError.value; return; }
  saving.value = true;
  try {
    const toSave = normalized(fields.value);
    await pageForms.save(role, pageKey, {
      title: meta.title.trim() || null,
      fields: toSave,
    });
    serverFields.value = toSave;
    savedAt.value = new Date().toLocaleTimeString();
  } catch (e) {
    saveError.value = e.response?.data?.error || "Save failed";
  } finally {
    saving.value = false;
  }
}

async function loadEntries() {
  try {
    entries.value = await pageForms.entries(role, pageKey);
    entriesLoaded.value = true;
  } catch (e) {
    saveError.value = e.response?.data?.error || "Could not load submissions";
  }
}
function showSubmissions() {
  tab.value = "submissions";
  if (!entriesLoaded.value) loadEntries();
}

// Render a submission's answers against the field definitions as they were
// persisted (their real keys), so values line up even if labels were since
// edited in the builder.
function entryPairs(entry) {
  return (serverFields.value || []).map((f) => {
    let v = entry.data?.[f.key];
    if (Array.isArray(v)) v = v.join(", ");
    return { label: f.label, value: v === undefined || v === "" || v === null ? "—" : String(v) };
  });
}
</script>

<template>
  <section class="builder">
    <div class="head">
      <div class="head__left">
        <button type="button" class="back" @click="router.push('/app/forms')">← Content Manager</button>
        <div>
          <h1>{{ slot?.label || pageKey }}</h1>
          <p class="muted">
            <span class="rolechip">{{ roleLabel }}</span>
            <code v-if="slot" class="path">{{ slot.path }}</code>
          </p>
        </div>
      </div>
      <div class="head__actions">
        <span v-if="savedAt" class="saved">Saved {{ savedAt }}</span>
        <button v-if="tab === 'build'" type="button" class="primary" :disabled="saving" @click="save">
          {{ saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </div>

    <p v-if="loadError" class="error">{{ loadError }}</p>
    <template v-else-if="loading"><p class="muted">Loading…</p></template>

    <template v-else>
      <div class="tabs">
        <button type="button" :class="{ on: tab === 'build' }" @click="tab = 'build'">Build fields</button>
        <button type="button" :class="{ on: tab === 'submissions' }" @click="showSubmissions">Submissions</button>
      </div>

      <!-- Build -->
      <div v-if="tab === 'build'" class="split">
        <div class="panel editor">
          <div class="field">
            <label for="ptitle">Section heading <span class="muted">(optional)</span></label>
            <input id="ptitle" type="text" v-model="meta.title" :placeholder="slot?.label" />
          </div>

          <h2 class="section-title">Fields</h2>
          <div v-if="!fields.length" class="no-fields">No fields yet. Add the first field below.</div>

          <div v-for="(f, i) in fields" :key="f._id" class="fcard">
            <div class="fcard__top">
              <span class="fcard__num">{{ i + 1 }}</span>
              <input class="fcard__label" type="text" v-model="f.label" placeholder="Field label" />
              <div class="fcard__reorder">
                <button type="button" :disabled="i === 0" title="Move up" @click="move(i, -1)">↑</button>
                <button type="button" :disabled="i === fields.length - 1" title="Move down" @click="move(i, 1)">↓</button>
                <button type="button" class="del" title="Delete field" @click="removeField(i)">✕</button>
              </div>
            </div>
            <div class="fcard__row">
              <div class="field">
                <label>Type</label>
                <select v-model="f.type">
                  <option v-for="t in FIELD_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>
              <label class="req-toggle"><input type="checkbox" v-model="f.required" /> Required</label>
            </div>
            <div v-if="supportsPlaceholder(f.type)" class="field">
              <label>Placeholder <span class="muted">(optional)</span></label>
              <input type="text" v-model="f.placeholder" placeholder="Hint text shown inside the field" />
            </div>
            <div v-if="isChoice(f.type)" class="field">
              <label>Options <span class="muted">(one per line)</span></label>
              <textarea rows="3" v-model="f.optionsText" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
            </div>
          </div>

          <button type="button" class="add" @click="addField">Add field</button>
          <p v-if="saveError" class="error">{{ saveError }}</p>
        </div>

        <div class="panel preview">
          <div class="preview__label">Live preview — what {{ roleLabel }} sees</div>
          <div class="preview__canvas">
            <p v-if="!previewFields.length" class="muted preview__empty">Add fields with labels to see them here.</p>
            <ConfigurableForm v-else :key="previewKey" :config="previewConfig" v-model="previewModel" />
          </div>
        </div>
      </div>

      <!-- Submissions -->
      <div v-else class="panel submissions">
        <p v-if="!entries.length" class="muted">No submissions yet.</p>
        <table v-else class="grid">
          <thead><tr><th>Submitted by</th><th>Answers</th><th>Updated</th></tr></thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td>
                <div class="who">{{ e.user?.name || "—" }}</div>
                <div class="whoemail">{{ e.user?.email }}</div>
              </td>
              <td>
                <ul class="answers">
                  <li v-for="pair in entryPairs(e)" :key="pair.label"><span class="k">{{ pair.label }}:</span> {{ pair.value }}</li>
                </ul>
              </td>
              <td>{{ formatDate(e.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.head__left { display: flex; align-items: flex-start; gap: 1rem; }
.head__actions { display: flex; align-items: center; gap: 0.9rem; }
.back { background: none; border: none; color: var(--accent-text); font: inherit; font-weight: 600; cursor: pointer; padding: 0.35rem 0; }
.back:hover { text-decoration: underline; }
.muted { color: var(--muted); }
.saved { color: var(--muted); font-size: 0.82rem; }
.head .muted { display: flex; align-items: center; gap: 0.5rem; }
.rolechip { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: var(--accent-050); color: var(--accent-text); padding: 0.12rem 0.5rem; border-radius: 999px; }
.path { font-family: ui-monospace, "Consolas", monospace; font-size: 0.78rem; color: var(--muted); }

.tabs { display: flex; gap: 0.4rem; margin: 1.1rem 0 1rem; border-bottom: 1px solid var(--line); }
.tabs button { background: none; border: none; padding: 0.5rem 0.9rem; font: inherit; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tabs button.on { color: var(--accent-text); border-bottom-color: var(--accent-text); }

.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; }
.preview { position: sticky; top: 1rem; }

.section-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-text); font-weight: 700; margin: 1.25rem 0 0.75rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: var(--muted); }
.field input, .field select, .field textarea {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.55rem 0.65rem; width: 100%;
}
.field textarea { resize: vertical; }
.field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050); }

.no-fields { color: var(--muted); font-size: 0.9rem; padding: 0.75rem 0 1rem; }
.fcard { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.9rem; margin-bottom: 0.85rem; background: var(--paper); display: flex; flex-direction: column; gap: 0.75rem; }
.fcard__top { display: flex; align-items: center; gap: 0.6rem; }
.fcard__num { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; background: var(--accent-050); color: var(--accent-text); }
.fcard__label { flex: 1; font-family: inherit; font-size: 0.95rem; font-weight: 600; color: var(--text); background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.5rem 0.6rem; }
.fcard__label:focus { outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050); }
.fcard__reorder { display: flex; gap: 0.25rem; }
.fcard__reorder button { width: 28px; height: 28px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: var(--radius-sm); cursor: pointer; color: var(--muted); font-size: 0.9rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.fcard__reorder button:hover:not(:disabled) { border-color: var(--accent-text); color: var(--accent-text); }
.fcard__reorder button:disabled { opacity: 0.35; cursor: not-allowed; }
.fcard__reorder .del:hover { border-color: var(--danger); color: var(--danger); }
.fcard__row { display: flex; align-items: flex-end; gap: 1rem; }
.fcard__row .field { flex: 1; }
.req-toggle { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--text); white-space: nowrap; padding-bottom: 0.6rem; cursor: pointer; }
.req-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }

.add { width: 100%; border: 1px dashed var(--line-strong); background: none; color: var(--accent-text); border-radius: var(--radius-sm); padding: 0.65rem; font: inherit; font-weight: 600; cursor: pointer; margin-top: 0.25rem; }
.add:hover { background: var(--accent-050); border-color: var(--accent-text); }

.preview__label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; margin-bottom: 0.85rem; }
.preview__canvas { border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); padding: 1.1rem; background: var(--paper); }
.preview__empty { text-align: center; padding: 1.5rem 0; }

.who { font-weight: 600; }
.whoemail { font-size: 0.8rem; color: var(--muted); }
.answers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.88rem; }
.answers .k { color: var(--muted); font-weight: 600; }

@media (max-width: 900px) { .split { grid-template-columns: 1fr; } .preview { position: static; } }
</style>
