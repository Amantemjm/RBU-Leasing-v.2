<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from "vue";
import { fetchExecutiveDashboard, downloadExecutiveExcel } from "../lib/executiveDashboard.js";
import { formatPHP } from "../lib/formatters.js";
import AppIcon from "../components/AppIcon.vue";

const data = ref(null);
const loading = ref(true);
const error = ref("");
const downloading = ref(false);
const anim = ref(false);

onMounted(async () => {
  try { data.value = await fetchExecutiveDashboard(); }
  catch (e) { error.value = e.response?.data?.error || "Could not load dashboard"; }
  finally { loading.value = false; }
  await nextTick();
  requestAnimationFrame(() => requestAnimationFrame(() => { anim.value = true; }));
});

async function doDownload() {
  downloading.value = true;
  try { await downloadExecutiveExcel(); }
  catch { error.value = "Excel export failed"; }
  finally { downloading.value = false; }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
const dateLabel = computed(() => {
  if (!data.value) return "";
  const [y, m, d] = data.value.meta.asOf.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${d}, ${y}`;
});

const S = computed(() => data.value?.summary);

// ---- Per-unit operational status ----
function unitStatus(u) {
  if (u.leased) return (u.daysToExpiry != null && u.daysToExpiry <= 90) ? "Near Expiry" : "Leased";
  if (u.daysToExpiry != null && Math.abs(u.daysToExpiry) >= 180) return "Attention Required";
  return "Available";
}
const rows = computed(() => (data.value?.all || []).map((u) => ({ ...u, _status: unitStatus(u) })));

// ---- KPI cards ----
const KPIS = computed(() => S.value ? [
  { key: "all", icon: "building", label: "Total Registered Units", value: S.value.totalUnits, sub: "Units in portfolio", tone: "brand" },
  { key: "Leased", icon: "check", label: "Currently Leased", value: S.value.leased, sub: `${S.value.occupancyRate}% occupancy`, tone: "good" },
  { key: "Available", icon: "grid", label: "Registered but Not Leased", value: S.value.notLeased, sub: "Available for leasing", tone: "neutral" },
  { key: "Near Expiry", icon: "file", label: "Near Expiry", value: S.value.nearExpiry, sub: "Within next 90 days", tone: "warn" },
  { key: "occ", icon: "grid", label: "Lease / Occupancy Rate", value: S.value.occupancyRate + "%", sub: `${S.value.leased} of ${S.value.totalUnits} units leased`, tone: "brand" },
] : []);

// ---- Management insights ----
const insights = computed(() => {
  if (!S.value) return [];
  const s = S.value;
  const topVac = [...(data.value.byProperty || [])].filter((p) => p.notLeased > 0).sort((a, b) => b.notLeased - a.notLeased).slice(0, 3);
  return [
    { tone: "good", title: "Occupancy", body: `${s.occupancyRate}% of registered units are currently leased.` },
    { tone: s.buckets.within30 ? "warn" : "good", title: "Renewal Risk", body: s.buckets.within30 ? `${s.buckets.within30} lease(s) expiring within 30 days.` : "No leases are expiring within the next 30 days." },
    { tone: s.notLeased ? "attention" : "good", title: "Vacancy Opportunity", body: `${s.notLeased} registered units are currently not leased.`, action: s.notLeased ? { label: "View available", filter: "Available" } : null },
    { tone: "good", title: "Revenue", body: `${formatPHP(s.monthlyActiveRent)} monthly active lease value.` },
    topVac.length ? { tone: "critical", title: "High Vacancy Properties", body: `${topVac.map((p) => p.property).join(", ")} require leasing attention.` } : null,
  ].filter(Boolean);
});

// ---- Occupancy viz ----
const occ = computed(() => {
  const s = S.value; if (!s) return null;
  const leasedPct = s.totalUnits ? (s.leased / s.totalUnits) * 100 : 0;
  return { rate: s.occupancyRate, leased: s.leased, available: s.notLeased, leasedPct };
});

// ---- Lease expiry buckets ----
const bucketRows = computed(() => {
  const b = S.value?.buckets || { within30: 0, within60: 0, within90: 0 };
  const max = Math.max(1, b.within30, b.within60, b.within90);
  return [
    { key: "0–30 Days", n: b.within30, tone: "crit", w: (b.within30 / max) * 100 },
    { key: "31–60 Days", n: b.within60, tone: "warn", w: (b.within60 / max) * 100 },
    { key: "61–90 Days", n: b.within90, tone: "brand", w: (b.within90 / max) * 100 },
  ];
});

// ---- Portfolio by property ----
const byProp = computed(() => (data.value?.byProperty || []).slice(0, 8));

// ---- Expiry timeline grouped by year ----
const timeline = computed(() => {
  const e = data.value?.expiryByMonth || {};
  const max = Math.max(1, ...Object.values(e));
  const byYear = {};
  Object.keys(e).sort().forEach((ym) => {
    const [y, m] = ym.split("-");
    (byYear[y] ||= []).push({ ym, month: MONTHS[Number(m) - 1], count: e[ym], w: (e[ym] / max) * 100 });
  });
  return Object.entries(byYear).map(([year, months]) => ({ year, months }));
});

// ---- Data table state ----
const QUICK = [
  { k: "all", label: "All Units" },
  { k: "Leased", label: "Leased" },
  { k: "Available", label: "Available" },
  { k: "Near Expiry", label: "Near Expiry" },
  { k: "Attention Required", label: "Attention" },
];
const quick = ref("all");
const search = ref("");
const propFilter = ref("");
const tenantFilter = ref("");
const monthFilter = ref("");
const sortKey = ref(null);
const sortDir = ref(1);
const page = ref(1);
const pageSize = 8;
const colMenuOpen = ref(false);

const COLUMNS = reactive([
  { key: "unit", label: "Unit", visible: true, always: true },
  { key: "property", label: "Property", visible: true },
  { key: "_status", label: "Status", visible: true, badge: true },
  { key: "tenant", label: "Tenant", visible: true },
  { key: "end", label: "Lease Expiry", visible: true, date: true },
  { key: "monthlyRent", label: "Monthly Rent", visible: true, peso: true, num: true },
]);
const visibleCols = computed(() => COLUMNS.filter((c) => c.visible));

const properties = computed(() => [...new Set(rows.value.map((r) => r.property))].sort());
const tenants = computed(() => [...new Set(rows.value.filter((r) => r.tenant && r.tenant !== "—").map((r) => r.tenant))].sort());
const quickCounts = computed(() => {
  const c = { all: rows.value.length };
  for (const q of QUICK) if (q.k !== "all") c[q.k] = rows.value.filter((r) => r._status === q.k).length;
  return c;
});

const filtered = computed(() => {
  let rs = rows.value;
  if (quick.value !== "all") rs = rs.filter((r) => r._status === quick.value);
  if (propFilter.value) rs = rs.filter((r) => r.property === propFilter.value);
  if (tenantFilter.value) rs = rs.filter((r) => r.tenant === tenantFilter.value);
  if (monthFilter.value) rs = rs.filter((r) => r.leased && r.end && r.end.slice(0, 7) === monthFilter.value);
  if (search.value) {
    const q = search.value.toLowerCase();
    rs = rs.filter((r) => [r.unit, r.property, r.tenant, r.owner].some((x) => String(x || "").toLowerCase().includes(q)));
  }
  if (sortKey.value) {
    const k = sortKey.value;
    rs = [...rs].sort((a, b) => {
      let x = a[k], y = b[k];
      if (k === "monthlyRent" || k === "daysToExpiry") { x = x ?? -Infinity; y = y ?? -Infinity; return (x - y) * sortDir.value; }
      return String(x ?? "").localeCompare(String(y ?? "")) * sortDir.value;
    });
  }
  return rs;
});
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch([quick, search, propFilter, tenantFilter, monthFilter, sortKey, sortDir], () => { page.value = 1; });

function sortBy(k) { if (sortKey.value === k) sortDir.value *= -1; else { sortKey.value = k; sortDir.value = 1; } }
function goFilter(k, opts = {}) {
  quick.value = k; monthFilter.value = opts.month || ""; if (opts.prop !== undefined) propFilter.value = opts.prop;
  nextTick(() => document.getElementById("unitsTable")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
function statusClass(s) {
  return s === "Leased" ? "b-good" : s === "Near Expiry" ? "b-warn" : s === "Attention Required" ? "b-crit" : "b-neutral";
}
function exportCsv() {
  const cols = visibleCols.value;
  const head = cols.map((c) => `"${c.label}"`).join(",");
  const body = filtered.value.map((r) => cols.map((c) => {
    let v = c.key === "_status" ? r._status : r[c.key];
    v = v == null ? "" : String(v).replace(/"/g, '""');
    return `"${v}"`;
  }).join(",")).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "registered-units.csv"; a.click(); URL.revokeObjectURL(a.href);
}
function cellValue(r, c) {
  if (c.key === "_status") return r._status;
  const v = r[c.key];
  if (c.peso) return v == null ? "—" : formatPHP(v);
  if (c.date) return fmtDate(v);
  return v == null || v === "" ? "—" : v;
}
</script>

<template>
  <section class="dash">
    <!-- Header -->
    <header class="dash__head">
      <div>
        <h1>Leasing Dashboard</h1>
        <p class="dash__sub">Portfolio overview and leasing performance <span v-if="data" class="dot-sep">·</span> <span v-if="data" class="asof">As of {{ dateLabel }}</span></p>
      </div>
      <button type="button" class="btn btn--primary" :class="{ loading: downloading }" :disabled="downloading || !data" @click="doDownload">
        <AppIcon name="download" :size="16" />
        <span>{{ downloading ? "Generating…" : "Download Excel" }}</span>
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- Loading skeleton -->
    <template v-if="loading">
      <div class="kpis"><div v-for="i in 5" :key="i" class="kpi sk"></div></div>
      <div class="grid grid--2"><div class="card sk" style="height:220px"></div><div class="card sk" style="height:220px"></div></div>
    </template>

    <template v-else-if="data">
      <!-- KPI cards -->
      <div class="kpis">
        <button v-for="k in KPIS" :key="k.key" type="button" class="kpi" :class="'t-' + k.tone" @click="goFilter(k.key === 'occ' ? 'all' : k.key)">
          <span class="kpi__icon"><AppIcon :name="k.icon" :size="18" /></span>
          <span class="kpi__label">{{ k.label }}</span>
          <span class="kpi__value">{{ k.value }}</span>
          <span class="kpi__sub">{{ k.sub }}</span>
          <span class="kpi__go"><AppIcon name="arrow-right" :size="14" /></span>
        </button>
      </div>

      <!-- Insights + Occupancy -->
      <div class="grid grid--insights">
        <div class="card">
          <div class="card__head"><h2>Management Insights</h2><span class="card__hint">Key indicators &amp; actions</span></div>
          <div class="insights">
            <div v-for="(i, idx) in insights" :key="idx" class="insight">
              <span class="insight__ind" :class="'i-' + i.tone"></span>
              <div class="insight__body">
                <div class="insight__title">{{ i.title }}</div>
                <div class="insight__text">{{ i.body }}</div>
              </div>
              <button v-if="i.action" type="button" class="insight__act" @click="goFilter(i.action.filter)">{{ i.action.label }} <AppIcon name="arrow-right" :size="13" /></button>
            </div>
          </div>
        </div>

        <div class="card occ">
          <div class="card__head"><h2>Occupancy</h2></div>
          <div class="occ__main">
            <div class="occ__ring" :style="{ background: `conic-gradient(var(--accent) ${anim ? occ.leasedPct : 0}%, var(--paper) 0)` }">
              <div class="occ__hole"><span class="occ__pct">{{ occ.rate }}%</span><span class="occ__cap">Occupied</span></div>
            </div>
            <div class="occ__legend">
              <div class="occ__row"><span class="dot d-good"></span>Leased <b>{{ occ.leased }}</b></div>
              <div class="occ__row"><span class="dot d-neutral"></span>Available <b>{{ occ.available }}</b></div>
              <div class="occ__vac">{{ occ.available }} vacant units</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Expiry monitoring + Portfolio -->
      <div class="grid grid--2">
        <div class="card">
          <div class="card__head"><h2>Leases Expiring</h2><button type="button" class="link" @click="goFilter('Near Expiry')">View expiring leases <AppIcon name="arrow-right" :size="13" /></button></div>
          <div class="bars">
            <button v-for="b in bucketRows" :key="b.key" type="button" class="metricrow" @click="goFilter('Near Expiry')">
              <span class="metricrow__k">{{ b.key }}</span>
              <span class="track"><span class="fill" :class="'f-' + b.tone" :style="{ width: (anim ? b.w : 0) + '%' }"></span></span>
              <span class="metricrow__v">{{ b.n }} <em>leases</em></span>
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h2>Portfolio by Property</h2><span class="card__hint">Leased vs. available</span></div>
          <div class="props">
            <button v-for="p in byProp" :key="p.property" type="button" class="prop" @click="goFilter('all', { prop: p.property })">
              <div class="prop__top"><span class="prop__name" :title="p.property">{{ p.property }}</span><span class="prop__ratio">{{ p.leased }} / {{ p.total }} leased</span></div>
              <span class="track"><span class="fill f-good" :style="{ width: (anim ? (p.leased / p.total * 100) : 0) + '%' }"></span></span>
              <div class="prop__meta">{{ p.leased }} Leased · {{ p.notLeased }} Available</div>
            </button>
          </div>
        </div>
      </div>

      <!-- Expiry timeline -->
      <div class="card">
        <div class="card__head"><h2>Lease Expiry Timeline</h2><span class="card__hint">Active leases by expiry month</span></div>
        <div v-if="timeline.length" class="timeline">
          <div v-for="yr in timeline" :key="yr.year" class="tl-year">
            <div class="tl-year__label">{{ yr.year }}</div>
            <div class="tl-months">
              <button v-for="m in yr.months" :key="m.ym" type="button" class="tl-month" @click="goFilter('Near Expiry', { month: m.ym })">
                <span class="tl-month__m">{{ m.month }}</span>
                <span class="tl-bar"><span class="tl-bar__fill" :style="{ width: (anim ? m.w : 0) + '%' }"></span></span>
                <span class="tl-month__n">{{ m.count }}</span>
              </button>
            </div>
          </div>
        </div>
        <p v-else class="muted small">No active leases expiring within 12 months.</p>
      </div>

      <!-- Registered units table -->
      <div id="unitsTable" class="card table-card">
        <div class="card__head">
          <div><h2>Registered Units</h2><span class="card__hint">{{ filtered.length }} of {{ rows.length }} units</span></div>
          <div class="table-tools">
            <div class="searchbox"><AppIcon name="search" :size="15" /><input v-model="search" type="search" placeholder="Search unit, tenant, property…" /></div>
            <select v-model="propFilter" class="sel"><option value="">All properties</option><option v-for="p in properties" :key="p" :value="p">{{ p }}</option></select>
            <select v-model="tenantFilter" class="sel"><option value="">All tenants</option><option v-for="t in tenants" :key="t" :value="t">{{ t }}</option></select>
            <div class="colmenu">
              <button type="button" class="iconbtn" title="Columns" @click="colMenuOpen = !colMenuOpen"><AppIcon name="columns" :size="16" /></button>
              <div v-show="colMenuOpen" class="colmenu__pop">
                <label v-for="c in COLUMNS" :key="c.key" class="colmenu__item"><input type="checkbox" v-model="c.visible" :disabled="c.always" /> {{ c.label }}</label>
              </div>
              <div v-show="colMenuOpen" class="colmenu__scrim" @click="colMenuOpen = false"></div>
            </div>
            <button type="button" class="iconbtn" title="Export CSV" @click="exportCsv"><AppIcon name="download" :size="16" /></button>
          </div>
        </div>

        <!-- Quick filters -->
        <div class="quick">
          <button v-for="q in QUICK" :key="q.k" type="button" class="quick__pill" :class="{ on: quick === q.k }" @click="quick = q.k; monthFilter = ''">
            {{ q.label }} <span class="quick__n">{{ quickCounts[q.k] }}</span>
          </button>
          <button v-if="monthFilter" type="button" class="quick__clear" @click="monthFilter = ''"><AppIcon name="x" :size="12" /> Expiring {{ monthFilter }}</button>
        </div>

        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th v-for="c in visibleCols" :key="c.key" :class="{ num: c.num }" @click="sortBy(c.key)">
                  {{ c.label }}<AppIcon v-if="sortKey === c.key" name="chevron" :size="12" :class="['th-sort', { up: sortDir < 0 }]" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in paged" :key="r.unit + r.property">
                <td v-for="c in visibleCols" :key="c.key" :class="{ num: c.num }">
                  <span v-if="c.badge" class="badge" :class="statusClass(r._status)"><span class="badge__dot"></span>{{ r._status }}</span>
                  <template v-else>{{ cellValue(r, c) }}</template>
                </td>
              </tr>
              <tr v-if="paged.length === 0"><td :colspan="visibleCols.length" class="empty">No units match these filters.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="pager">
          <span class="pager__info">Page {{ page }} of {{ totalPages }} · {{ filtered.length }} results</span>
          <div class="pager__btns">
            <button type="button" class="pgbtn" :disabled="page <= 1" @click="page--">Previous</button>
            <button type="button" class="pgbtn" :disabled="page >= totalPages" @click="page++">Next</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.dash {
  font-family: var(--ui); display: flex; flex-direction: column; gap: 1.15rem;
  --good: #157a3e; --good-bg: #e7f3ec; --warn: #b5751a; --warn-bg: #f8efdd; --crit: #b23a2e; --crit-bg: #f7e0dc; --neutral: #6b7a72; --neutral-bg: var(--paper);
}
/* Status colours track the browser theme too (parity with light) */
@media (prefers-color-scheme: dark) {
  .dash {
    --good: #5cc492; --good-bg: rgba(21, 122, 62, 0.22);
    --warn: #d6a24f; --warn-bg: rgba(181, 117, 26, 0.22);
    --crit: #e0897c; --crit-bg: rgba(178, 58, 46, 0.22);
    --neutral: #9fb3a8; --neutral-bg: rgba(255, 255, 255, 0.05);
  }
}
.muted { color: var(--muted); } .small { font-size: .85rem; }
.error { color: var(--danger); background: var(--danger-050); border-radius: var(--radius-sm); padding: .6rem .8rem; }
.dot-sep { color: var(--faint); margin: 0 .15rem; }

/* Header */
.dash__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.dash__head h1 { font-size: 1.7rem; font-weight: 700; letter-spacing: -.02em; color: var(--text); margin: 0; }
.dash__sub { margin: .25rem 0 0; color: var(--muted); font-size: .9rem; }
.asof { color: var(--faint); }
.btn { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid var(--line-strong); background: var(--surface); color: var(--text); font: inherit; font-size: .88rem; font-weight: 600; padding: .6rem 1rem; border-radius: 10px; cursor: pointer; transition: transform .12s, background .15s, box-shadow .15s; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 1px 2px rgba(9,30,22,.12); }
.btn--primary:hover:not(:disabled) { background: var(--accent-600); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn:disabled { opacity: .65; cursor: default; }
.btn.loading svg { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* KPI cards */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; }
.kpi { position: relative; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 1.1rem 1.15rem; cursor: pointer; display: flex; flex-direction: column; gap: .1rem; transition: transform .14s, box-shadow .16s, border-color .16s; overflow: hidden; }
.kpi:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--line-strong); }
.kpi__icon { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: .55rem; }
.kpi__label { font-size: .74rem; color: var(--muted); font-weight: 600; }
.kpi__value { font-size: 2rem; font-weight: 700; letter-spacing: -.02em; color: var(--text); line-height: 1.1; margin-top: .1rem; }
.kpi__sub { font-size: .76rem; color: var(--faint); margin-top: .1rem; }
.kpi__go { position: absolute; top: 1.1rem; right: 1rem; color: var(--faint); opacity: 0; transform: translateX(-4px); transition: .16s; }
.kpi:hover .kpi__go { opacity: 1; transform: translateX(0); }
.t-brand .kpi__icon { background: var(--accent-050); color: var(--accent); }
.t-good .kpi__icon { background: var(--good-bg); color: var(--good); }
.t-warn .kpi__icon { background: var(--warn-bg); color: var(--warn); }
.t-neutral .kpi__icon { background: var(--neutral-bg); color: var(--neutral); }

/* Grid + cards */
.grid { display: grid; gap: 1rem; }
.grid--2 { grid-template-columns: 1fr 1fr; }
.grid--insights { grid-template-columns: 1.55fr 1fr; }
@media (max-width: 900px) { .grid--2, .grid--insights { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 1.15rem 1.25rem; box-shadow: var(--shadow-sm); }
.card__head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: 1rem; }
.card__head h2 { font-size: 1rem; font-weight: 700; color: var(--text); letter-spacing: -.01em; }
.card__hint { font-size: .76rem; color: var(--faint); }
.link { display: inline-flex; align-items: center; gap: .3rem; background: none; border: none; color: var(--accent-text); font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; }
.link:hover { color: var(--accent-600); }
.sk { background: linear-gradient(90deg, var(--paper), var(--surface), var(--paper)); background-size: 200% 100%; animation: shim 1.3s infinite; border-radius: 14px; min-height: 118px; border: 1px solid var(--line); }
@keyframes shim { to { background-position: -200% 0; } }

/* Insights */
.insights { display: flex; flex-direction: column; }
.insight { display: flex; align-items: center; gap: .8rem; padding: .7rem 0; border-top: 1px solid var(--line); }
.insight:first-child { border-top: none; padding-top: 0; }
.insight__ind { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.i-good { background: var(--good); } .i-warn { background: var(--warn); } .i-attention { background: #c98a1a; } .i-critical { background: var(--crit); }
.insight__body { flex: 1; min-width: 0; }
.insight__title { font-size: .86rem; font-weight: 600; color: var(--text); }
.insight__text { font-size: .82rem; color: var(--muted); }
.insight__act { flex-shrink: 0; display: inline-flex; align-items: center; gap: .25rem; background: none; border: none; color: var(--accent-text); font: inherit; font-size: .78rem; font-weight: 600; cursor: pointer; }

/* Occupancy */
.occ__main { display: flex; align-items: center; gap: 1.4rem; flex-wrap: wrap; }
.occ__ring { width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; transition: background 1s cubic-bezier(.3,.7,.3,1); }
.occ__hole { width: 96px; height: 96px; border-radius: 50%; background: var(--surface); display: grid; place-content: center; text-align: center; box-shadow: inset 0 0 0 1px var(--line); }
.occ__pct { font-size: 1.7rem; font-weight: 700; color: var(--text); letter-spacing: -.02em; }
.occ__cap { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.occ__legend { display: flex; flex-direction: column; gap: .55rem; font-size: .88rem; color: var(--text); }
.occ__row { display: flex; align-items: center; gap: .5rem; }
.occ__row b { margin-left: auto; font-variant-numeric: tabular-nums; }
.occ__vac { margin-top: .35rem; font-size: .8rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: .55rem; }
.dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.d-good { background: var(--accent); } .d-neutral { background: var(--line-strong); }

/* Bars / metric rows */
.bars, .props { display: flex; flex-direction: column; gap: .8rem; }
.metricrow { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: .8rem; background: none; border: none; padding: .15rem 0; cursor: pointer; font: inherit; text-align: left; }
.metricrow__k { font-size: .82rem; color: var(--muted); font-weight: 500; }
.metricrow__v { font-size: .85rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.metricrow__v em { font-style: normal; font-weight: 500; color: var(--faint); font-size: .78rem; }
.track { height: 9px; background: var(--paper); border-radius: 999px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); }
.fill { display: block; height: 100%; border-radius: 999px; transition: width .85s cubic-bezier(.22,.61,.36,1); }
.f-good { background: var(--accent); } .f-warn { background: #d19022; } .f-crit { background: var(--crit); } .f-brand { background: var(--accent); }

/* Property comparison */
.prop { display: flex; flex-direction: column; gap: .4rem; background: none; border: none; padding: .3rem .4rem; margin: -.3rem -.4rem; border-radius: 9px; cursor: pointer; font: inherit; text-align: left; transition: background .14s; }
.prop:hover { background: var(--paper); }
.prop__top { display: flex; justify-content: space-between; gap: .6rem; align-items: baseline; }
.prop__name { font-size: .85rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prop__ratio { font-size: .76rem; color: var(--muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.prop__meta { font-size: .74rem; color: var(--faint); }

/* Timeline */
.timeline { display: flex; flex-direction: column; gap: 1rem; }
.tl-year { display: grid; grid-template-columns: 54px 1fr; gap: 1rem; align-items: start; }
.tl-year__label { font-size: 1rem; font-weight: 700; color: var(--text); padding-top: .1rem; }
.tl-months { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .5rem .9rem; }
.tl-month { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: .5rem; background: none; border: none; padding: .2rem .3rem; border-radius: 7px; cursor: pointer; font: inherit; transition: background .14s; }
.tl-month:hover { background: var(--paper); }
.tl-month__m { font-size: .78rem; color: var(--muted); }
.tl-bar { height: 7px; background: var(--paper); border-radius: 999px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); }
.tl-bar__fill { display: block; height: 100%; background: var(--accent); border-radius: 999px; transition: width .85s cubic-bezier(.22,.61,.36,1); }
.tl-month__n { font-size: .78rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

/* Table */
.table-card { padding-bottom: .4rem; }
.table-tools { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.searchbox { display: flex; align-items: center; gap: .45rem; background: var(--paper); border: 1px solid var(--line); border-radius: 9px; padding: .4rem .6rem; color: var(--muted); }
.searchbox input { border: none; background: none; outline: none; font: inherit; font-size: .85rem; color: var(--text); width: 190px; }
.sel { border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 9px; padding: .45rem .6rem; font: inherit; font-size: .82rem; max-width: 160px; }
.iconbtn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); background: var(--surface); color: var(--muted); border-radius: 9px; cursor: pointer; transition: .14s; }
.iconbtn:hover { color: var(--text); border-color: var(--line-strong); background: var(--paper); }
.colmenu { position: relative; }
.colmenu__pop { position: absolute; right: 0; top: calc(100% + 6px); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow-md); padding: .4rem; z-index: 30; width: 170px; }
.colmenu__item { display: flex; align-items: center; gap: .5rem; padding: .35rem .4rem; font-size: .82rem; color: var(--text); border-radius: 6px; cursor: pointer; }
.colmenu__item:hover { background: var(--paper); }
.colmenu__scrim { position: fixed; inset: 0; z-index: 25; }

.quick { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .3rem; }
.quick__pill { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid var(--line); background: var(--surface); color: var(--muted); border-radius: 999px; padding: .35rem .75rem; font: inherit; font-size: .8rem; font-weight: 500; cursor: pointer; transition: .14s; }
.quick__pill:hover { border-color: var(--line-strong); color: var(--text); }
.quick__pill.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.quick__n { font-size: .72rem; font-weight: 700; background: var(--paper); color: var(--muted); border-radius: 999px; padding: 0 .35rem; }
.quick__pill.on .quick__n { background: rgba(255,255,255,.25); color: #fff; }
.quick__clear { display: inline-flex; align-items: center; gap: .3rem; border: 1px dashed var(--line-strong); background: none; color: var(--muted); border-radius: 999px; padding: .35rem .7rem; font: inherit; font-size: .78rem; cursor: pointer; }

.tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 11px; margin-top: .5rem; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
thead th { position: sticky; top: 0; background: var(--thead-bg); color: var(--muted); font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; text-align: left; padding: .65rem .85rem; cursor: pointer; user-select: none; white-space: nowrap; border-bottom: 1px solid var(--line); }
thead th:hover { color: var(--accent-text); }
.th-sort { vertical-align: middle; transform: rotate(90deg); } .th-sort.up { transform: rotate(-90deg); }
tbody td { padding: .7rem .85rem; border-bottom: 1px solid var(--line); color: var(--text); white-space: nowrap; }
tbody tr:last-child td { border-bottom: none; }
tbody tr { transition: background .1s; } tbody tr:hover { background: var(--row-hover); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.empty { text-align: center; color: var(--muted); padding: 2rem; }
.badge { display: inline-flex; align-items: center; gap: .4rem; font-size: .72rem; font-weight: 600; padding: .18rem .55rem; border-radius: 999px; white-space: nowrap; }
.badge__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.b-good { background: var(--good-bg); color: var(--good); } .b-warn { background: var(--warn-bg); color: var(--warn); }
.b-crit { background: var(--crit-bg); color: var(--crit); } .b-neutral { background: var(--neutral-bg); color: var(--neutral); }

.pager { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem .2rem .5rem; flex-wrap: wrap; }
.pager__info { font-size: .8rem; color: var(--muted); }
.pager__btns { display: flex; gap: .5rem; }
.pgbtn { border: 1px solid var(--line-strong); background: var(--surface); color: var(--text); border-radius: 8px; padding: .4rem .8rem; font: inherit; font-size: .82rem; cursor: pointer; }
.pgbtn:hover:not(:disabled) { background: var(--paper); }
.pgbtn:disabled { opacity: .5; cursor: default; }

@media (prefers-reduced-motion: reduce) { .fill, .tl-bar__fill, .occ__ring, .kpi, .btn { transition: none; } .btn.loading svg { animation: none; } }
</style>
