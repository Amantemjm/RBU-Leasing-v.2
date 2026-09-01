<script setup>
// The sequential approval routing chain (Leasing → Management → Authorized
// Approver → Final Approval). Read-only for lessees; staff can record a
// decision on the next actionable step.
import { computed, ref } from "vue";
import { leasingTransactions } from "../lib/resource.js";

const props = defineProps({
  transactionId: { type: String, required: true },
  steps: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
});
const emit = defineEmits(["changed"]);

const busy = ref("");
const error = ref("");

// A step is actionable only once every earlier step is Approved.
function actionable(step) {
  return props.editable && props.steps.filter((s) => s.order < step.order).every((s) => s.status === "Approved");
}
const allApproved = computed(() => props.steps.length && props.steps.every((s) => s.status === "Approved"));

async function decide(step, status) {
  let remarks = null;
  if (status === "Rejected" || status === "Returned") {
    remarks = window.prompt(`Reason for "${status}" (optional)`) || null;
  }
  busy.value = step.id; error.value = "";
  try {
    const txn = await leasingTransactions.decideStep(props.transactionId, step.id, { status, remarks });
    emit("changed", txn);
  } catch (e) {
    error.value = e.response?.data?.error || "Could not record the decision";
  } finally {
    busy.value = "";
  }
}
function statusClass(s) {
  return s === "Approved" ? "ok" : s === "Rejected" ? "bad" : s === "Returned" ? "warn" : "pending";
}
function decidedLabel(step) {
  if (!step.decidedAt) return "";
  const d = new Date(step.decidedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${step.approverName || "—"} · ${d}`;
}
</script>

<template>
  <div class="routing">
    <div v-if="allApproved" class="routing__done">✓ All approvals complete — ready to advance.</div>
    <ol class="chain">
      <li v-for="(s, i) in steps" :key="s.id" class="node" :class="statusClass(s.status)">
        <span class="node__rail" v-if="i < steps.length - 1" aria-hidden="true"></span>
        <span class="node__dot">{{ s.status === 'Approved' ? '✓' : s.status === 'Rejected' ? '✕' : i + 1 }}</span>
        <div class="node__body">
          <div class="node__top">
            <span class="node__name">{{ s.name }}</span>
            <span class="badge" :class="statusClass(s.status)">{{ s.status }}</span>
          </div>
          <div v-if="s.decidedAt" class="node__meta">{{ decidedLabel(s) }}</div>
          <div v-if="s.remarks" class="node__remarks">{{ s.remarks }}</div>
          <div v-if="actionable(s) && s.status !== 'Approved'" class="node__acts">
            <button type="button" class="primary" :disabled="busy === s.id" @click="decide(s, 'Approved')">Approve</button>
            <button type="button" class="secondary" :disabled="busy === s.id" @click="decide(s, 'Returned')">Return</button>
            <button type="button" class="danger" :disabled="busy === s.id" @click="decide(s, 'Rejected')">Reject</button>
          </div>
        </div>
      </li>
    </ol>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.routing__done { font-size: 0.85rem; font-weight: 600; color: var(--good); background: var(--good-050); border-radius: var(--radius-sm); padding: 0.5rem 0.7rem; margin-bottom: 0.75rem; }
.chain { list-style: none; margin: 0; padding: 0; }
.node { position: relative; display: flex; gap: 0.75rem; padding-bottom: 1rem; }
.node__rail { position: absolute; left: 13px; top: 26px; bottom: 0; width: 2px; background: var(--line); }
.node.ok .node__rail { background: var(--good); }
.node__dot { position: relative; z-index: 1; flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; background: var(--surface); border: 2px solid var(--line-strong); color: var(--muted); }
.node.ok .node__dot { background: var(--good); border-color: var(--good); color: #fff; }
.node.bad .node__dot { background: var(--danger); border-color: var(--danger); color: #fff; }
.node.warn .node__dot { border-color: var(--warn); color: var(--warn); }
.node__body { flex: 1; min-width: 0; }
.node__top { display: flex; align-items: center; gap: 0.5rem; }
.node__name { font-weight: 600; font-size: 0.9rem; }
.node__meta { font-size: 0.75rem; color: var(--faint); margin-top: 0.1rem; }
.node__remarks { font-size: 0.82rem; color: var(--muted); margin-top: 0.2rem; font-style: italic; }
.node__acts { display: flex; gap: 0.4rem; margin-top: 0.5rem; }
.badge { font-size: 0.66rem; font-weight: 700; padding: 0.1rem 0.5rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; }
.badge.ok { background: var(--good-050); color: var(--good); }
.badge.bad { background: var(--danger-050); color: var(--danger); }
.badge.warn { background: var(--warn-050); color: var(--warn); }
.badge.pending { background: var(--paper); color: var(--muted); }
.mini { font: inherit; font-size: 0.76rem; font-weight: 600; padding: 0.3rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--surface); cursor: pointer; }
.mini.ok { color: var(--good); border-color: var(--good); }
.mini.ok:hover:not(:disabled) { background: var(--good-050); }
.mini.warn { color: var(--warn); border-color: var(--warn); }
.mini.warn:hover:not(:disabled) { background: var(--warn-050); }
.mini.bad { color: var(--danger); border-color: var(--danger); }
.mini.bad:hover:not(:disabled) { background: var(--danger-050); }
.mini:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
