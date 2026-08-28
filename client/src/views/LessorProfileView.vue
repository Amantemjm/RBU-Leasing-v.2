<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { owners } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";

const route = useRoute();
const router = useRouter();
const p = ref(null);
const error = ref("");

onMounted(async () => {
  try { p.value = await owners.profile(route.params.id); }
  catch (e) { error.value = e.response?.data?.error || "Could not load lessor profile"; }
});
</script>

<template>
  <section v-if="error"><p class="error">{{ error }}</p></section>
  <section v-else-if="p" class="profile">
    <header class="head">
      <div>
        <h1>{{ p.owner.name }}</h1>
        <p class="muted">{{ [p.owner.email, p.owner.phone, p.owner.address].filter(Boolean).join(" · ") || "—" }}</p>
        <p class="muted small">Officer: {{ p.owner.assignedOfficer?.name || "Unassigned" }}<span v-if="p.account"> · Account: {{ p.account.status }}</span></p>
      </div>
    </header>

    <div class="panel">
      <h2>Units <span class="count">{{ p.units.length }}</span></h2>
      <ul class="rows">
        <li v-for="u in p.units" :key="u.id" class="row">
          <button type="button" class="link" @click="router.push(`/app/units/${u.id}`)">{{ u.unitNumber }}</button>
          <span class="muted">{{ u.tower || "—" }}</span>
          <span class="badge" :class="u.approvalStatus.toLowerCase()">{{ u.approvalStatus }}</span>
          <span v-if="u.reviewRemarks" class="muted small">{{ u.reviewRemarks }}</span>
        </li>
        <li v-if="!p.units.length" class="muted">No units.</li>
      </ul>
    </div>

    <div class="panel">
      <h2>Requirements <span class="count">{{ p.requirements.summary.approved }} of {{ p.requirements.summary.total }} approved</span></h2>
      <ul class="rows">
        <li v-for="r in p.requirements.items" :key="r.requirementKey" class="row">
          <span>{{ r.label }}</span>
          <span class="badge" :class="r.status.toLowerCase().replace(/ /g,'-')">{{ r.status }}</span>
          <span v-if="r.remarks" class="muted small">{{ r.remarks }}</span>
        </li>
      </ul>
      <button type="button" class="link" @click="router.push('/app/lessor-requirements-review')">Review requirements →</button>
    </div>

    <div class="panel">
      <h2>Acceptance Form</h2>
      <p v-if="p.acceptanceForm"><span class="badge">{{ p.acceptanceForm.status }}</span>
        <span v-if="p.acceptanceForm.submittedAt" class="muted small"> · submitted {{ formatDate(p.acceptanceForm.submittedAt) }}</span></p>
      <p v-else class="muted">No acceptance form yet.</p>
    </div>

    <div class="panel">
      <h2>Recent activity</h2>
      <ul class="rows">
        <li v-for="(a, i) in p.activity" :key="i" class="row">
          <span>{{ a.label }}</span><span class="muted small">{{ formatDate(a.at) }}</span>
        </li>
        <li v-if="!p.activity.length" class="muted">No activity yet.</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.head { margin-bottom: 1rem; }
.muted { color: var(--muted); } .small { font-size: 0.8rem; }
.panel { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.9rem 1rem; margin-bottom: 0.9rem; }
.panel h2 { font-size: 1rem; margin: 0 0 0.6rem; display: flex; align-items: baseline; gap: 0.6rem; }
.count { font-size: 0.78rem; color: var(--muted); font-weight: 500; }
.rows { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.badge.rejected, .badge.expired, .badge.for-resubmission { background: var(--danger-050); color: var(--danger); }
.badge.approved { background: var(--good-050); color: var(--good); }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; }
.error { color: var(--danger); }
</style>
