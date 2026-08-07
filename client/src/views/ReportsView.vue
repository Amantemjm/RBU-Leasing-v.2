<script setup>
import { ref } from "vue";
import { reports } from "../lib/reports.js";

const period = ref("month");
const days = ref(90);
const periods = ["month", "quarter", "year"];
</script>

<template>
  <section class="reports">
    <h1>Reports</h1>
    <div class="cards">
      <div class="card">
        <h2>Rent Roll</h2>
        <p>All active leases with tenant, unit, owner, rent, term, and balance.</p>
        <button type="button" @click="reports.rentRoll()">Download Rent Roll</button>
      </div>

      <div class="card">
        <h2>Collections</h2>
        <p>Payments received in a selected period.</p>
        <label class="inline">Period
          <select v-model="period">
            <option v-for="p in periods" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
        <button type="button" @click="reports.collections(period)">Download Collections</button>
      </div>

      <div class="card">
        <h2>Lease Expiry</h2>
        <p>Active leases expiring within a window.</p>
        <label class="inline">Days
          <input type="number" v-model.number="days" min="1" />
        </label>
        <button type="button" @click="reports.leaseExpiry(days)">Download Lease Expiry</button>
      </div>

      <div class="card">
        <h2>Owner Statement</h2>
        <p>Per owner: units, occupancy, and gross monthly income.</p>
        <button type="button" @click="reports.ownerStatement()">Download Owner Statement</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reports h1 {
  font-family: var(--display);
  font-size: 1.9rem;
  font-weight: 500;
  margin-bottom: 1.5rem;
}
.card h2 { text-transform: none; letter-spacing: 0; font-size: 1.05rem; color: var(--ink-800); margin-bottom: 0.5rem; }
.card p { margin-bottom: 1rem; }
.card .inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 1rem;
}
.card .inline select,
.card .inline input {
  font-family: inherit;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  text-transform: none;
  letter-spacing: 0;
}
.card .inline input { width: 5rem; }
.reports .card button {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.reports .card button:hover { background: var(--accent-600); }
</style>
