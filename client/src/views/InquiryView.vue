<script setup>
import { reactive, ref, computed, watch, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { createInquiry } from "../lib/inquiries.js";
import { INQUIRER_LABEL, INQUIRY_TYPES } from "../lib/inquiryOptions.js";
import InquiryShell from "./InquiryShell.vue";

const CONSENT_TEXT =
  "I consent to Ortigas and Company, Limited Partnership (OCLP), its divisions, and their " +
  "service providers collecting and using the personal data in this form to respond to my " +
  "inquiry and share relevant products and services by email.";

const router = useRouter();
const route = useRoute();

const VALID_TYPES = ["LESSOR", "LESSEE"];
const selectedType = VALID_TYPES.includes(route.query.as) ? route.query.as : null;
onMounted(() => { if (!selectedType) router.replace("/"); });

const form = reactive({
  category: "", inquirerType: selectedType || "", inquiryType: "", fullName: "", email: "", message: "", consent: false,
});
const submitting = ref(false);
const submitted = ref(false);
const error = ref("");

const inquiryTypeOptions = computed(() => (form.inquirerType ? INQUIRY_TYPES[form.inquirerType] : []));
watch(() => form.inquirerType, () => { form.inquiryType = ""; });

const canSubmit = computed(() =>
  !!form.category && !!form.inquirerType && !!form.inquiryType &&
  form.fullName.trim() !== "" && form.email.trim() !== "" && form.consent === true,
);

async function submit() {
  if (!canSubmit.value) return;
  error.value = "";
  submitting.value = true;
  try {
    const payload = {
      category: form.category, inquirerType: form.inquirerType, inquiryType: form.inquiryType,
      fullName: form.fullName.trim(), email: form.email.trim(), consent: true,
    };
    if (form.message.trim()) payload.message = form.message.trim();
    await createInquiry(payload);
    submitted.value = true;
    form.category = ""; form.inquiryType = "";
    form.fullName = ""; form.email = ""; form.message = ""; form.consent = false;
  } catch (e) {
    error.value = e.response?.data?.error || "Something went wrong. Please try again.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <InquiryShell :step="2" lede="A few quick details and our leasing team will get in touch — usually within one business day.">
    <transition name="swap" mode="out-in">
      <!-- Success -->
      <div v-if="submitted" key="done" class="thanks">
        <span class="check" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="64" height="64"><circle class="check__c" cx="26" cy="26" r="24" fill="none"/><path class="check__k" fill="none" d="M15 27l7 7 15-16"/></svg>
        </span>
        <h2>Inquiry received</h2>
        <p>Thanks — our leasing team will reach out by email soon.</p>
        <button type="button" class="primary" @click="submitted = false">Submit another inquiry</button>
      </div>

      <!-- Form -->
      <form v-else key="form" @submit.prevent="submit" novalidate>
        <div class="asrole">
          <span>Inquiring as <strong>{{ INQUIRER_LABEL[form.inquirerType] }}</strong></span>
          <a href="#" @click.prevent="router.push('/')">Change</a>
        </div>

        <div class="row">
        <div class="field">
          <span class="label">What are you interested in? <span class="req">*</span></span>
          <div class="seg" role="group" aria-label="Category">
            <button type="button" class="seg__opt" :class="{ on: form.category === 'RESIDENCES' }" :aria-pressed="form.category === 'RESIDENCES'" @click="form.category = 'RESIDENCES'">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>
              Residences
            </button>
            <button type="button" class="seg__opt" :class="{ on: form.category === 'OFFICES' }" :aria-pressed="form.category === 'OFFICES'" @click="form.category = 'OFFICES'">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4h10v17"/><path d="M14 9h6v12H4"/><path d="M7 8h.01M11 8h.01M7 12h.01M11 12h.01M7 16h.01M11 16h.01M17 13h.01M17 17h.01"/></svg>
              Offices
            </button>
          </div>
        </div>

        <div class="field">
          <label for="inquiryType">Inquiry type <span class="req">*</span></label>
          <select id="inquiryType" v-model="form.inquiryType">
            <option value="" disabled>Select…</option>
            <option v-for="opt in inquiryTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
        </div>

        <div class="row">
          <div class="field">
            <label for="fullName">Full name <span class="req">*</span></label>
            <input id="fullName" type="text" v-model="form.fullName" autocomplete="name" placeholder="Juan dela Cruz" />
          </div>
          <div class="field">
            <label for="email">Email <span class="req">*</span></label>
            <input id="email" type="email" v-model="form.email" autocomplete="email" placeholder="you@email.com" />
          </div>
        </div>

        <div class="field">
          <label for="message">Additional details <span class="optional">(optional)</span></label>
          <textarea id="message" rows="2" v-model="form.message" placeholder="Preferred estate, unit size, budget, move-in date…"></textarea>
        </div>

        <label class="consent">
          <input type="checkbox" v-model="form.consent" />
          <span>{{ CONSENT_TEXT }}</span>
        </label>

        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="primary submit" :disabled="!canSubmit || submitting">
          <span v-if="submitting" class="spinner" aria-hidden="true"></span>
          {{ submitting ? "Submitting…" : "Submit inquiry" }}
        </button>
      </form>
    </transition>
  </InquiryShell>
</template>

<style scoped>
form { display: flex; flex-direction: column; gap: 0.8rem; }
/* The form is meant to sit still rather than scroll inside its card, so it
   gives back vertical space as the window gets shorter. Keyed to height, not
   width — a wide-but-short window is the case that actually overflows. */
@media (max-height: 820px) { form { gap: 0.62rem; } }
@media (max-height: 760px) {
  form { gap: 0.5rem; }
  .consent { font-size: 0.74rem; padding: 0.45rem 0.65rem; line-height: 1.4; }
}
@media (max-height: 700px) {
  form { gap: 0.4rem; }
  textarea { min-height: 0; }
}
.asrole {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  background: var(--accent-050); border: 1px solid var(--accent-100, var(--accent-050)); color: var(--accent-text);
  border-radius: 999px; padding: 0.5rem 0.95rem; font-size: 0.86rem;
}
.asrole strong { font-weight: 700; }
.asrole a { color: var(--accent-text); font-weight: 600; font-size: 0.8rem; text-decoration: underline; }

.field { display: flex; flex-direction: column; gap: 0.3rem; }
.label, .field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: var(--muted); }
.req { color: var(--danger); }
.optional { font-weight: 400; text-transform: none; letter-spacing: 0; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.15rem; }
@media (max-width: 620px) { .row { grid-template-columns: 1fr; gap: 0.8rem; } }

.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.seg__opt {
  display: flex; align-items: center; justify-content: center; gap: 0.55rem; cursor: pointer;
  background: var(--surface); border: 1.5px solid var(--line-strong); border-radius: var(--radius-sm);
  padding: 0.6rem 0.75rem; font: inherit; font-size: 0.92rem; font-weight: 550; color: var(--ink-700);
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease, transform 0.12s ease;
}
.seg__opt svg { color: var(--muted); transition: color 0.16s ease; }
.seg__opt:hover { border-color: var(--muted); }
.seg__opt.on { border-color: var(--accent); background: var(--accent-050); color: var(--accent-text); }
.seg__opt.on svg { color: var(--accent); }
.seg__opt:active { transform: scale(0.98); }

.field input, .field select, .field textarea {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.65rem 0.75rem; width: 100%;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.field textarea { resize: vertical; }
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050);
}
.field input::placeholder, .field textarea::placeholder { color: var(--faint); }

.consent { display: flex; gap: 0.65rem; align-items: flex-start; font-size: 0.78rem; color: var(--muted); line-height: 1.45; cursor: pointer; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; }
.consent input { margin-top: 0.15rem; flex-shrink: 0; width: 16px; height: 16px; accent-color: var(--accent); }

.primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  background: var(--accent); color: #fff; border: 1px solid transparent; box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm); padding: 0.75rem 1.3rem; font: inherit; font-weight: 600; cursor: pointer;
  transition: background 0.16s ease, transform 0.12s ease, box-shadow 0.16s ease;
}
.primary:hover:not(:disabled) { background: var(--accent-600); transform: translateY(-1px); box-shadow: 0 8px 18px -8px rgba(12,56,38,0.5); }
.primary:active:not(:disabled) { transform: none; }
.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.submit { align-self: flex-start; min-width: 170px; }
.spinner { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.error { margin: 0; color: var(--danger); background: var(--danger-050); border-radius: var(--radius-sm); padding: 0.6rem 0.75rem; font-size: 0.88rem; }

/* success */
.thanks { text-align: center; display: flex; flex-direction: column; gap: 0.7rem; align-items: center; padding: 1.25rem 0; }
.thanks h2 { font-family: var(--display); font-weight: 500; font-size: 1.7rem; margin: 0.2rem 0 0; color: var(--ink-800); }
.thanks p { color: var(--muted); margin: 0 0 0.4rem; }
.check__c { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 151; stroke-dashoffset: 151; animation: draw 0.5s ease forwards; }
.check__k { stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw 0.35s 0.4s ease forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }

/* route/state swap */
.swap-enter-active, .swap-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.swap-enter-from { opacity: 0; transform: translateY(8px); }
.swap-leave-to { opacity: 0; transform: translateY(-8px); }

@media (max-width: 560px) { .row { grid-template-columns: 1fr; } .submit { align-self: stretch; } }
@media (prefers-reduced-motion: reduce) {
  .check__c, .check__k { animation: none; stroke-dashoffset: 0; }
  .spinner { animation-duration: 1.2s; }
  .swap-enter-active, .swap-leave-active { transition: none; }
  .primary:hover:not(:disabled) { transform: none; }
}
</style>
