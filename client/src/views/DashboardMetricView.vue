<script setup>
// The page behind a dashboard tile. A KPI is a question — "which units are
// these?" — and the dashboard can only answer it by dimming itself and pointing
// at a table. This answers it directly: the same figure, then the rows it came
// from, itemised and exportable.
import { ref, computed, onMounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { fetchExecutiveDashboard } from "../lib/executiveDashboard.js";
import { formatPHP, formatDate } from "../lib/formatters.js";

const route = useRoute();
const data = ref(null);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try { data.value = await fetchExecutiveDashboard(); }
  catch (e) { error.value = e.response?.data?.error || "Could not load this metric"; }
  finally { loading.value = false; }
});

const S = computed(() => data.value?.summary || null);
const all = computed(() => data.value?.all || []);

// Each metric knows its own title, its headline figure, and which rows answer
// it. Occupancy is the odd one out: it is a ratio, so the rows that explain it
// are properties, not units.
const METRICS = {
  all: {
    title: "Total Registered Units",
    blurb: "Every unit in the portfolio.",
    value: () => String(S.value?.totalUnits ?? 0),
    rows: () => all.value,
  },
  leased: {
    title: "Currently Leased",
    blurb: "Units with a lease running today.",
    value: () => String(S.value?.leased ?? 0),
    rows: () => all.value.filter((u) => u.leased),
  },
  available: {
    title: "Registered but Not Leased",
    blurb: "Units registered and ready to lease.",
    value: () => String(S.value?.notLeased ?? 0),
    rows: () => all.value.filter((u) => !u.leased),
  },
  "near-expiry": {
    title: "Near Expiry",
    blurb: "Leases ending within the next 90 days.",
    value: () => String(S.value?.nearExpiry ?? 0),
    rows: () => all.value.filter((u) => u.daysToExpiry != null && u.daysToExpiry <= 90 && u.leased),
  },
  occupancy: {
    title: "Lease / Occupancy Rate",
    blurb: "How the rate is made up, property by property.",
    value: () => `${S.value?.occupancyRate ?? 0}%`,
    byProperty: true,
    rows: () => data.value?.byProperty || [],
  },
};

// An unrecognised key lands on the whole portfolio rather than an error page —
// the number is still true, just broader than asked for.
const metric = computed(() => METRICS[route.params.key] || METRICS.all);
const rows = computed(() => (data.value ? metric.value.rows() : []));
const byProperty = computed(() => !!metric.value.byProperty);

const sub = computed(() => {
  if (!S.value) return "";
  if (byProperty.value) return `${S.value.leased} of ${S.value.totalUnits} units leased`;
  return `${rows.value.length} ${rows.value.length === 1 ? "unit" : "units"}`;
});

function statusOf(u) {
  if (!u.leased) return "Available";
  if (u.daysToExpiry != null && u.daysToExpiry <= 90) return "Near Expiry";
  return "Leased";
}
const statusClass = (s) =>
  s === "Leased" ? "b-good" : s === "Near Expiry" ? "b-warn" : "b-neutral";

const pct = (p) => (p.total ? Math.round((p.leased / p.total) * 100) : 0);

function exportCsv() {
  const head = byProperty.value
    ? ["Property", "Total", "Leased", "Not leased", "Occupancy %"]
    : ["Unit", "Property", "Status", "Tenant", "Assigned Officer", "Lease Expiry", "Monthly Rent"];
  const body = byProperty.value
    ? rows.value.map((p) => [p.property, p.total, p.leased, p.notLeased, pct(p)])
    : rows.value.map((u) => [u.unit, u.property, statusOf(u), u.tenant || "—", u.officer || "—", u.end || "—", u.monthlyRent ?? ""]);
  const csv = [head, ...body]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${route.params.key || "metric"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <section>
    <header>
      <div>
        <RouterLink class="back" to="/app">&larr; Dashboard</RouterLink>
        <h1>{{ metric.title }}</h1>
        <p class="blurb">{{ metric.blurb }}</p>
      </div>
      <button v-if="rows.length" type="button" class="secondary" @click="exportCsv">Export CSV</button>
    </header>

    <p v-if="error" class="error-line">{{ error }}</p>
    <p v-else-if="loading" class="muted small">Loading…</p>

    <template v-else>
      <div class="panel metric">
        <div class="metric__value">{{ metric.value() }}</div>
        <div class="metric__sub">{{ sub }}</div>
      </div>

      <div class="panel panel--table">
        <p v-if="!rows.length" class="muted small pad">No units to show for this metric.</p>

        <table v-else-if="byProperty">
          <thead>
            <tr>
              <th>Property</th>
              <th class="num">Total</th>
              <th class="num">Leased</th>
              <th class="num">Not leased</th>
              <th class="num">Occupancy</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in rows" :key="p.property">
              <td>{{ p.property }}</td>
              <td class="num">{{ p.total }}</td>
              <td class="num">{{ p.leased }}</td>
              <td class="num">{{ p.notLeased }}</td>
              <td class="num">{{ pct(p) }}%</td>
            </tr>
          </tbody>
        </table>

        <table v-else>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Property</th>
              <th>Status</th>
              <th>Tenant</th>
              <th>Assigned Officer</th>
              <th>Lease Expiry</th>
              <th class="num">Monthly Rent</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in rows" :key="u.unit + u.property">
              <td>{{ u.unit }}</td>
              <td>{{ u.property }}</td>
              <td><span class="badge" :class="statusClass(statusOf(u))">{{ statusOf(u) }}</span></td>
              <td>{{ u.tenant || "—" }}</td>
              <td>{{ u.officer || "—" }}</td>
              <td>{{ u.end ? formatDate(u.end) : "—" }}</td>
              <td class="num">{{ u.monthlyRent != null ? formatPHP(u.monthlyRent) : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 0.4rem; font-size: 0.85rem; font-weight: 600; color: var(--accent-text); text-decoration: none; }
.back:hover { text-decoration: underline; }
.blurb { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.9rem; }

.metric { display: flex; align-items: baseline; gap: 0.9rem; }
.metric__value { font-family: var(--display); font-size: 2.6rem; font-weight: 600; line-height: 1; color: var(--ink-800); }
.metric__sub { color: var(--muted); font-size: 0.9rem; }

.pad { padding: 0.9rem; }
.badge { font-size: 0.7rem; font-weight: 700; padding: 0.12rem 0.5rem; border-radius: 999px; border: 1px solid currentColor; }
.b-good { color: var(--good); }
.b-warn { color: var(--warn); }
.b-neutral { color: var(--muted); }
</style>
