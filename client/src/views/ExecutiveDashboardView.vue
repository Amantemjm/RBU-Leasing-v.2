<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import { fetchExecutiveDashboard, downloadExecutiveExcel } from "../lib/executiveDashboard.js";
import { formatPHP, formatDate } from "../lib/formatters.js";

const data = ref(null);
const loading = ref(true);
const error = ref("");
const anim = ref(false); // drives the chart grow-in animation
const cat = ref("all");
const query = ref("");
const propFilter = ref("");
const sortKey = ref(null);
const sortDir = ref(1);
const downloading = ref(false);

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

const S = computed(() => data.value?.summary);
const TILES = computed(() => S.value ? [
  { key: "all", label: "Total Registered Units", v: S.value.totalUnits, sub: "units on record", stripe: "var(--accent)" },
  { key: "leased", label: "Currently Leased", v: S.value.leased, sub: S.value.occupancyRate + "% occupancy", stripe: "var(--good)" },
  { key: "notLeased", label: "Registered · Not Leased", v: S.value.notLeased, sub: S.value.longVacant + " vacant 180d+", stripe: "var(--crit)" },
  { key: "nearExpiry", label: "Near Expiry (≤90d)", v: S.value.nearExpiry, sub: S.value.buckets.within30 + " within 30 days", stripe: "var(--warn)" },
  { key: "occ", label: "Lease / Occupancy Rate", v: S.value.occupancyRate + "%", sub: formatPHP(S.value.monthlyActiveRent) + "/mo", stripe: "var(--accent-text)" },
] : []);

const insights = computed(() => {
  if (!S.value) return [];
  const s = S.value;
  const topVac = [...(data.value.byProperty || [])].filter((p) => p.notLeased > 0).sort((a, b) => b.notLeased - a.notLeased).slice(0, 3);
  return [
    { c: "var(--accent-text)", t: `Occupancy stands at <b>${s.occupancyRate}%</b> — ${s.leased} of ${s.totalUnits} registered units are on an active lease.` },
    { c: "var(--warn)", t: `<b>${s.nearExpiry} leases expire within 90 days</b>; <b>${s.buckets.within30}</b> fall inside 30 days and need renewal contact this week.` },
    { c: "var(--crit)", t: `<b>${s.longVacant} units</b> have sat unleased for 180+ days — the biggest recoverable-revenue pool.` },
    { c: "var(--good)", t: `Active leases bill <b>${formatPHP(s.monthlyActiveRent)}/month</b> (~${formatPHP(s.annualActiveRent)} annualized).` },
    topVac.length ? { c: "var(--crit)", t: `Highest vacancy exposure: ${topVac.map((p) => `<b>${p.property}</b> (${p.notLeased})`).join(", ")}.` } : null,
  ].filter(Boolean);
});

// --- charts ---
const donut = computed(() => {
  const frac = S.value ? S.value.leased / (S.value.totalUnits || 1) : 0;
  const r = 52, C = 2 * Math.PI * r;
  return { r, C, dash: (frac * C).toFixed(1) + " " + C.toFixed(1) };
});
const buckets = computed(() => {
  const b = S.value?.buckets || { within30: 0, within60: 0, within90: 0 };
  const max = Math.max(1, b.within30, b.within60, b.within90);
  return [["≤30 days", b.within30, "var(--crit)"], ["31–60 days", b.within60, "var(--warn)"], ["61–90 days", b.within90, "var(--good)"]]
    .map(([l, v, c]) => ({ l, v, c, w: (v / max * 100).toFixed(0) }));
});
const byProp = computed(() => {
  const rows = (data.value?.byProperty || []).slice(0, 10);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return rows.map((p) => ({ ...p, lw: (p.leased / max * 100).toFixed(0), nw: (p.notLeased / max * 100).toFixed(0) }));
});
const byMonth = computed(() => {
  const e = data.value?.expiryByMonth || {};
  const keys = Object.keys(e).sort();
  const max = Math.max(1, ...Object.values(e));
  return keys.map((k) => ({ k, v: e[k], w: (e[k] / max * 100).toFixed(0) }));
});

// --- detail table ---
const COLS = {
  all: { title: "All Registered Units", src: () => data.value.all, cols: [
    ["property", "Property"], ["unit", "Unit"], ["type", "Type"], ["owner", "Owner"], ["tenant", "Tenant"],
    ["start", "Start", "date"], ["end", "End", "date"], ["monthlyRent", "Rent", "peso"], ["status", "Status", "status"], ["daysToExpiry", "Days→Exp", "num"]] },
  leased: { title: "Currently Leased", src: () => data.value.leased, cols: [
    ["property", "Property"], ["unit", "Unit"], ["type", "Type"], ["tenant", "Tenant"], ["start", "Start", "date"], ["end", "End", "date"],
    ["monthlyRent", "Rent", "peso"], ["daysToExpiry", "Days→Exp", "num"], ["owner", "Owner"]] },
  notLeased: { title: "Registered but Not Leased", src: () => data.value.notLeased, cols: [
    ["property", "Property"], ["unit", "Unit"], ["type", "Type"], ["owner", "Owner"], ["tenant", "Last Tenant"],
    ["lastLeaseEnd", "Last Lease End", "date"], ["unleasedDays", "Days Unleased", "vac"], ["monthlyRent", "Last Rate", "peso"], ["recommendedAction", "Recommended Action", "action"]] },
  nearExpiry: { title: "Near-Expiry Leases", src: () => data.value.nearExpiry, cols: [
    ["property", "Property"], ["unit", "Unit"], ["tenant", "Tenant"], ["start", "Start", "date"], ["end", "Expiry", "date"],
    ["remaining", "Remaining", "remain"], ["monthlyRent", "Rent", "peso"], ["recommendedAction", "Recommended Action", "action"]] },
};
const spec = computed(() => COLS[cat.value]);
const properties = computed(() => [...new Set((spec.value?.src() || []).map((r) => r.property))].sort());
const rows = computed(() => {
  let rs = (spec.value?.src() || []).slice();
  if (propFilter.value) rs = rs.filter((r) => r.property === propFilter.value);
  if (query.value) {
    const q = query.value.toLowerCase();
    rs = rs.filter((r) => [r.property, r.unit, r.tenant, r.owner, r.type].some((x) => String(x || "").toLowerCase().includes(q)));
  }
  if (sortKey.value) {
    rs.sort((a, b) => {
      const x = a[sortKey.value], y = b[sortKey.value];
      if (typeof x === "number" && typeof y === "number") return (x - y) * sortDir.value;
      return String(x).localeCompare(String(y)) * sortDir.value;
    });
  }
  return rs;
});
function selectCat(k) {
  cat.value = k === "occ" ? "all" : k;
  sortKey.value = null; propFilter.value = ""; query.value = "";
  document.getElementById("execDetail")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function sortBy(k) { if (sortKey.value === k) sortDir.value *= -1; else { sortKey.value = k; sortDir.value = 1; } }
function isNum(kind) { return kind === "num" || kind === "peso" || kind === "vac"; }
function cell(row, col) {
  const [k, , kind] = col;
  const v = row[k];
  if (kind === "peso") return v == null ? "—" : formatPHP(v);
  if (kind === "date") return formatDate(v) || "—";
  return v == null || v === "" ? "—" : v;
}
function actionClass(v) { return /URGENT|escalate/i.test(v) ? "p-crit" : /offer|aggress/i.test(v) ? "p-warn" : "p-mut"; }
function remainClass(row) { const d = row.daysToExpiry; return d <= 30 ? "p-crit" : d <= 60 ? "p-warn" : "p-mut"; }
function vacClass(v) { return v >= 180 ? "p-crit" : v >= 90 ? "p-warn" : "p-mut"; }
</script>

<template>
  <section class="exec">
    <header class="exec__head">
      <div>
        <h1>Dashboard</h1>
        <p v-if="data" class="muted">Leasing portfolio · as of {{ data.meta.asOf }}</p>
      </div>
      <button type="button" class="dl" :disabled="downloading || !data" @click="doDownload">
        {{ downloading ? "Preparing…" : "⬇ Download Excel" }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-if="data && !loading">
      <div class="tiles">
        <button v-for="t in TILES" :key="t.key" type="button" class="tile" :class="{ active: t.key === cat || (t.key === 'occ' && false) }" @click="selectCat(t.key)">
          <span class="tile__stripe" :style="{ background: t.stripe }"></span>
          <span class="tile__k">{{ t.label }}</span>
          <span class="tile__v">{{ t.v }}</span>
          <span class="tile__sub">{{ t.sub }}</span>
        </button>
      </div>

      <div class="grid2">
        <div class="card">
          <h2>Executive Insights</h2>
          <div class="insights">
            <div v-for="(i, idx) in insights" :key="idx" class="ins">
              <span class="ins__dot" :style="{ background: i.c }"></span><span v-html="i.t"></span>
            </div>
          </div>
        </div>
        <div class="card">
          <h2>Occupancy</h2>
          <div class="donut">
            <svg width="140" height="140" viewBox="0 0 140 140" class="donutsvg">
              <defs>
                <linearGradient id="occGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="var(--accent)" />
                  <stop offset="100%" stop-color="#3ca06b" />
                </linearGradient>
              </defs>
              <circle cx="70" cy="70" :r="donut.r" fill="none" stroke="var(--paper)" stroke-width="15" />
              <circle cx="70" cy="70" :r="donut.r" fill="none" stroke="url(#occGrad)" stroke-width="15" stroke-linecap="round"
                class="donut__arc" :stroke-dasharray="anim ? donut.dash : ('0 ' + donut.C)" transform="rotate(-90 70 70)" />
              <text x="70" y="66" text-anchor="middle" class="donut__pct">{{ S.occupancyRate }}%</text>
              <text x="70" y="84" text-anchor="middle" class="donut__cap">occupied</text>
            </svg>
            <div class="legend">
              <span><i class="dot" style="background:var(--good)"></i>Leased · <b>{{ S.leased }}</b></span>
              <span><i class="dot" style="background:var(--line-strong)"></i>Not leased · <b>{{ S.notLeased }}</b></span>
            </div>
          </div>
          <h2 style="margin-top:.9rem">Leases expiring (next 90 days)</h2>
          <div class="bars">
            <div v-for="b in buckets" :key="b.l" class="bar">
              <span class="bar__label">{{ b.l }}</span>
              <span class="bar__track"><span class="bar__fill" :style="{ width: (anim ? b.w : 0) + '%', background: b.c }"></span></span>
              <span class="bar__val">{{ b.v }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <h2>Portfolio by property — leased vs. not leased</h2>
          <div class="bars">
            <div v-for="p in byProp" :key="p.property" class="bar">
              <span class="bar__label" :title="p.property">{{ p.property }}</span>
              <span class="bar__track stack">
                <span class="bar__fill seg-l" :style="{ width: (anim ? p.lw : 0) + '%' }"></span>
                <span class="bar__fill seg-n" :style="{ width: (anim ? p.nw : 0) + '%' }"></span>
              </span>
              <span class="bar__val">{{ p.leased }}/{{ p.total }}</span>
            </div>
          </div>
          <div class="legend"><span><i class="dot" style="background:var(--good)"></i>Leased</span><span><i class="dot" style="background:var(--crit)"></i>Not leased</span></div>
        </div>
        <div class="card">
          <h2>Active leases expiring by month</h2>
          <div v-if="byMonth.length" class="bars">
            <div v-for="m in byMonth" :key="m.k" class="bar">
              <span class="bar__label">{{ m.k }}</span>
              <span class="bar__track"><span class="bar__fill grad-accent" :style="{ width: (anim ? m.w : 0) + '%' }"></span></span>
              <span class="bar__val">{{ m.v }}</span>
            </div>
          </div>
          <p v-else class="muted small">No active leases expiring within 12 months.</p>
        </div>
      </div>

      <div id="execDetail" class="detail">
        <div class="detail__head">
          <h2>{{ spec.title }}</h2>
          <span class="count">{{ rows.length }}</span>
          <input v-model="query" class="search" type="search" placeholder="Search unit, tenant, owner…" />
        </div>
        <div class="chips">
          <button type="button" class="chip" :class="{ on: propFilter === '' }" @click="propFilter = ''">All properties</button>
          <button v-for="p in properties" :key="p" type="button" class="chip" :class="{ on: propFilter === p }" @click="propFilter = p">{{ p }}</button>
        </div>
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th v-for="c in spec.cols" :key="c[0]" :class="{ num: isNum(c[2]) }" @click="sortBy(c[0])">
                  {{ c[1] }}<span v-if="sortKey === c[0]">{{ sortDir > 0 ? " ▲" : " ▼" }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in rows" :key="i">
                <td v-for="c in spec.cols" :key="c[0]" :class="{ num: isNum(c[2]) }">
                  <span v-if="c[2] === 'status'" class="pill" :class="r.leased ? 'p-good' : 'p-crit'">{{ r.leased ? 'Leased' : 'Available' }}</span>
                  <span v-else-if="c[2] === 'action'" class="pill" :class="actionClass(r[c[0]])">{{ r[c[0]] }}</span>
                  <span v-else-if="c[2] === 'remain'" class="pill" :class="remainClass(r)">{{ r[c[0]] }}</span>
                  <span v-else-if="c[2] === 'vac'" class="pill" :class="vacClass(r[c[0]])">{{ r[c[0]] ?? '—' }}</span>
                  <template v-else>{{ cell(r, c) }}</template>
                </td>
              </tr>
              <tr v-if="rows.length === 0"><td :colspan="spec.cols.length" class="muted">No records.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.exec { display: flex; flex-direction: column; gap: 1rem; --good: #1f7a4d; --warn: #c07414; --crit: #b5372a;
  --good-bg: #e2f2e9; --warn-bg: #faedd8; --crit-bg: #f7ddd8; --surface-2: var(--paper); }
.exec__head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
.exec__head h1 { margin: 0; }
.muted { color: var(--muted); } .small { font-size: .85rem; }
.error { color: var(--danger); }
.dl { background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); padding: .55rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
.dl:hover { background: var(--accent-600); } .dl:disabled { opacity: .6; cursor: default; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .8rem; }
.tile { position: relative; text-align: left; background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 14px;
  padding: .95rem 1.05rem; cursor: pointer; box-shadow: var(--shadow-sm); overflow: hidden; transition: transform .12s, border-color .15s; }
.tile:hover { transform: translateY(-3px); border-color: var(--accent); }
.tile.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset, var(--shadow-sm); }
.tile__stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.tile__k { display: block; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
.tile__v { display: block; font-family: var(--display); font-weight: 600; font-size: 2rem; line-height: 1.15; margin-top: .25rem; color: var(--accent-text); }
.tile__sub { display: block; font-size: .76rem; color: var(--faint); }

.grid2 { display: grid; grid-template-columns: 1.15fr .85fr; gap: 1rem; }
@media (max-width: 880px) { .grid2 { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-sm); padding: 1rem 1.15rem; }
.card h2 { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; margin-bottom: .8rem; }
.insights { display: flex; flex-direction: column; gap: .6rem; }
.ins { display: flex; gap: .55rem; font-size: .9rem; align-items: flex-start; }
.ins__dot { width: 8px; height: 8px; border-radius: 50%; margin-top: .45rem; flex-shrink: 0; }
.donut { display: flex; align-items: center; gap: 1.1rem; flex-wrap: wrap; }
.donutsvg { flex-shrink: 0; filter: drop-shadow(0 3px 6px rgba(20,40,28,.12)); }
.donut__arc { transition: stroke-dasharray .95s cubic-bezier(.22,.61,.36,1); }
.donut__pct { font-family: var(--display); font-size: 25px; font-weight: 600; fill: var(--text); }
.donut__cap { font-size: 9px; fill: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
.legend { display: flex; flex-direction: column; gap: .4rem; font-size: .83rem; color: var(--muted); }
.legend b { color: var(--text); }
.legend .dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: .4rem; }
.bars { display: flex; flex-direction: column; gap: .55rem; }
.bar { display: grid; grid-template-columns: 118px 1fr auto; gap: .65rem; align-items: center; font-size: .82rem; }
.bar__label { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar__track { background: var(--paper); border-radius: 999px; height: 18px; overflow: hidden; display: flex; box-shadow: inset 0 0 0 1px var(--line); }
.bar__fill { height: 100%; border-radius: 999px; transition: width .85s cubic-bezier(.22,.61,.36,1); }
.bar__track.stack .bar__fill { border-radius: 0; }
.seg-l { background: linear-gradient(90deg, var(--good), #3ca06b); }
.seg-n { background: linear-gradient(90deg, #c85644, var(--crit)); }
.grad-accent { background: linear-gradient(90deg, var(--accent), #3ca06b); }
.bar__val { font-weight: 700; color: var(--text); min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .bar__fill, .donut__arc { transition: none; } }

.detail { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-sm); overflow: hidden; }
.detail__head { display: flex; align-items: center; gap: .7rem; flex-wrap: wrap; padding: .9rem 1.1rem; border-bottom: 1px solid var(--line); }
.detail__head h2 { font-family: var(--display); font-weight: 600; font-size: 1.1rem; margin: 0; }
.count { background: var(--accent); color: #fff; font-size: .72rem; font-weight: 700; border-radius: 999px; padding: .1rem .55rem; }
.search { margin-left: auto; border: 1px solid var(--line-strong); background: var(--paper); color: var(--text); border-radius: 8px; padding: .4rem .6rem; font: inherit; font-size: .85rem; min-width: 190px; }
.chips { display: flex; gap: .35rem; flex-wrap: wrap; padding: .7rem 1.1rem 0; }
.chip { border: 1px solid var(--line-strong); background: var(--paper); color: var(--muted); font: inherit; font-size: .75rem; padding: .22rem .6rem; border-radius: 999px; cursor: pointer; }
.chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.tablewrap { overflow-x: auto; padding: .4rem .4rem 1rem; }
table { border-collapse: collapse; width: 100%; font-size: .83rem; }
th, td { text-align: left; padding: .5rem .7rem; white-space: nowrap; }
th { color: var(--muted); font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; cursor: pointer; border-bottom: 1px solid var(--line-strong); user-select: none; }
th:hover { color: var(--accent-text); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr { border-bottom: 1px solid var(--line); }
tbody tr:hover { background: var(--paper); }
.pill { font-size: .7rem; font-weight: 700; padding: .1rem .5rem; border-radius: 999px; white-space: nowrap; }
.p-good { background: var(--good-bg); color: var(--good); } .p-warn { background: var(--warn-bg); color: var(--warn); }
.p-crit { background: var(--crit-bg); color: var(--crit); } .p-mut { background: var(--paper); color: var(--muted); }
</style>
