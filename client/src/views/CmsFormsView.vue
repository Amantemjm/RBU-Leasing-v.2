<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { pageForms } from "../lib/resource.js";
import { ROLE_PAGE_FORMS, PAGE_FORM_ROLES, ROLE_LABELS } from "../../../shared/pageForms.js";

const router = useRouter();
const configured = ref({}); // `${role}:${pageKey}` -> { fieldCount, entryCount }
const loading = ref(false);
const listError = ref("");

async function load() {
  loading.value = true;
  listError.value = "";
  try {
    const rows = await pageForms.list();
    const map = {};
    for (const r of rows) {
      map[`${r.role}:${r.pageKey}`] = {
        fieldCount: Array.isArray(r.fields) ? r.fields.length : 0,
        entryCount: r.entryCount,
      };
    }
    configured.value = map;
  } catch (e) {
    listError.value = e.response?.data?.error || "Could not load form configuration";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const roles = computed(() =>
  PAGE_FORM_ROLES.map((role) => ({ role, label: ROLE_LABELS[role], pages: ROLE_PAGE_FORMS[role] })),
);
function status(role, pageKey) {
  return configured.value[`${role}:${pageKey}`] || null;
}
function open(role, pageKey) {
  router.push(`/app/forms/${role}/${pageKey}`);
}
</script>

<template>
  <section>
    <div class="head">
      <div>
        <h1>Content Manager</h1>
        <p class="muted">Configure the custom fields shown on each role's pages. Choose a page to build its fields; people in that role will see and fill them in.</p>
      </div>
    </div>

    <p v-if="listError" class="error">{{ listError }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>

    <div v-else class="roles">
      <div v-for="r in roles" :key="r.role" class="rolecard">
        <div class="rolecard__head">
          <h2>{{ r.label }}</h2>
          <span class="rolecard__tag">{{ r.pages.length }} {{ r.pages.length === 1 ? "page" : "pages" }}</span>
        </div>
        <ul class="pages">
          <li v-for="p in r.pages" :key="p.key" class="pagerow" @click="open(r.role, p.key)">
            <div class="pagerow__main">
              <span class="pagerow__label">{{ p.label }}</span>
              <span class="pagerow__path">{{ p.path }}</span>
            </div>
            <div class="pagerow__meta">
              <template v-if="status(r.role, p.key)">
                <span class="badge on">{{ status(r.role, p.key).fieldCount }} fields</span>
                <span v-if="status(r.role, p.key).entryCount" class="badge subtle">{{ status(r.role, p.key).entryCount }} submitted</span>
              </template>
              <span v-else class="badge">Not configured</span>
              <span class="pagerow__go" aria-hidden="true">›</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head .muted { max-width: 48rem; }
.muted { color: var(--muted); }
.roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.1rem; margin-top: 1.25rem; }
.rolecard { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.rolecard__head { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.1rem; border-bottom: 1px solid var(--line); }
.rolecard__head h2 { margin: 0; font-size: 1.05rem; }
.rolecard__tag { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.pages { list-style: none; margin: 0; padding: 0.4rem; }
.pagerow { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.7rem 0.75rem; border-radius: var(--radius-sm); cursor: pointer; }
.pagerow:hover { background: var(--row-hover, var(--accent-050)); }
.pagerow__main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.pagerow__label { font-weight: 600; }
.pagerow__path { font-size: 0.76rem; color: var(--muted); font-family: ui-monospace, "Consolas", monospace; }
.pagerow__meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.pagerow__go { color: var(--muted); font-size: 1.2rem; line-height: 1; }
.badge { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line-strong); color: var(--muted); white-space: nowrap; }
.badge.on { background: var(--accent-050); border-color: transparent; color: var(--accent-text); }
.badge.subtle { background: none; border-color: var(--line); }
</style>
