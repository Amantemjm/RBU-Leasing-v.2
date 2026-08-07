<script setup>
import { ref, onMounted } from "vue";
import { fetchDashboard } from "../lib/dashboard.js";
import { formatPHP } from "../lib/formatters.js";

const data = ref(null);
onMounted(async () => { data.value = await fetchDashboard(); });

function pct(rate) { return `${Math.round(rate * 100)}%`; }
</script>

<template>
  <section class="dashboard">
    <h1>Dashboard</h1>
    <div v-if="data" class="cards">
      <div class="card">
        <h2>Occupancy</h2>
        <p class="big">{{ pct(data.occupancy.rate) }}</p>
        <div class="meter" role="img" :aria-label="`${pct(data.occupancy.rate)} occupied`">
          <span class="meter__fill" :style="{ width: pct(data.occupancy.rate) }"></span>
        </div>
        <p>{{ data.occupancy.occupied }} of {{ data.occupancy.totalUnits }} units occupied</p>
      </div>

      <div class="card">
        <h2>Monthly income</h2>
        <p class="big">{{ formatPHP(data.income.monthlyIncome) }}</p>
        <p>{{ data.income.activeLeases }} active leases</p>
      </div>

      <div class="card">
        <h2>Leases expiring soon</h2>
        <p>≤30 days: {{ data.expiring.within30 }}</p>
        <p>31–60 days: {{ data.expiring.within60 }}</p>
        <p>61–90 days: {{ data.expiring.within90 }}</p>
      </div>

      <div class="card" :class="{ 'card--alert': data.overdue.overdueCount > 0 }">
        <h2>Overdue / outstanding</h2>
        <p class="big">{{ formatPHP(data.overdue.outstandingAmount) }}</p>
        <p>{{ data.overdue.overdueCount }} overdue ({{ formatPHP(data.overdue.overdueAmount) }})</p>
      </div>

      <div class="card">
        <h2>New leases this month</h2>
        <p class="big">{{ data.newLeasesThisMonth }}</p>
      </div>

      <div class="card">
        <h2>Totals</h2>
        <p>{{ data.counts.owners }} owners</p>
        <p>{{ data.counts.tenants }} tenants</p>
        <p>{{ data.counts.units }} units</p>
      </div>
    </div>
    <p v-else>Loading…</p>
  </section>
</template>
