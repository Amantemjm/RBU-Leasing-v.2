<script setup>
import { reactive, ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import { createInquiry } from "../lib/inquiries.js";
import { INQUIRER_TYPES, INQUIRER_LABEL, INQUIRY_TYPES } from "../lib/inquiryOptions.js";

const CONSENT_TEXT =
  "By clicking the button below, I give my consent to all divisions and organizations " +
  "in Ortigas and Company, Limited Partnership (OCLP), and their service providers and " +
  "agents to collect, use and disclose the personal data as contained in this form, or " +
  "as otherwise provided by me for the purpose of providing information on their products " +
  "and services to me via email, including but not limited to offers, promotions, and new " +
  "goods and services.";

const router = useRouter();
const auth = useAuthStore();

const appHome = computed(() =>
  auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app",
);
function goStaff() {
  router.push(auth.isAuthenticated ? appHome.value : "/login");
}

const form = reactive({
  category: "", inquirerType: "", inquiryType: "", fullName: "", email: "", message: "", consent: false,
});
const submitting = ref(false);
const submitted = ref(false);
const error = ref("");

// Inquiry Type options depend on the "I am a" choice; reset the type when it changes.
const inquiryTypeOptions = computed(() => (form.inquirerType ? INQUIRY_TYPES[form.inquirerType] : []));
watch(() => form.inquirerType, () => { form.inquiryType = ""; });

const canSubmit = computed(() =>
  !!form.category &&
  !!form.inquirerType &&
  !!form.inquiryType &&
  form.fullName.trim() !== "" &&
  form.email.trim() !== "" &&
  form.consent === true,
);

async function submit() {
  if (!canSubmit.value) return;
  error.value = "";
  submitting.value = true;
  try {
    const payload = {
      category: form.category,
      inquirerType: form.inquirerType,
      inquiryType: form.inquiryType,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      consent: true,
    };
    if (form.message.trim()) payload.message = form.message.trim();
    await createInquiry(payload);
    submitted.value = true;
    form.category = ""; form.inquirerType = ""; form.inquiryType = "";
    form.fullName = ""; form.email = ""; form.message = ""; form.consent = false;
  } catch (e) {
    error.value = e.response?.data?.error || "Something went wrong. Please try again.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="landing">
    <header class="landing__bar">
      <div class="brand">
        <span class="brand__mark">RBU</span>
        <span class="brand__sub">Leasing</span>
      </div>
    </header>

    <main class="landing__main">
      <section class="intro">
        <p class="eyebrow">Ortigas Land · Residential &amp; Office Leasing</p>
        <h1>Quick Inquiry</h1>
        <p class="lede">Tell us what you're looking for and our leasing team will get in touch.</p>
      </section>

      <section class="card">
        <div v-if="submitted" class="thanks">
          <h2>Thank you!</h2>
          <p>Your inquiry has been received. Our team will reach out to you by email soon.</p>
          <button type="button" class="primary" @click="submitted = false">Submit another inquiry</button>
        </div>

        <form v-else @submit.prevent="submit">
          <div class="field">
            <label for="category">Category <span class="req">*</span></label>
            <select id="category" v-model="form.category">
              <option value="" disabled>-</option>
              <option value="RESIDENCES">Residences</option>
              <option value="OFFICES">Offices</option>
            </select>
          </div>
          <div class="field">
            <label for="fullName">Full name <span class="req">*</span></label>
            <input id="fullName" type="text" v-model="form.fullName" autocomplete="name" />
          </div>
          <div class="field">
            <label for="email">Email <span class="req">*</span></label>
            <input id="email" type="email" v-model="form.email" autocomplete="email" />
          </div>
          <div class="field">
            <label for="inquirerType">I am a <span class="req">*</span></label>
            <select id="inquirerType" v-model="form.inquirerType">
              <option value="" disabled>-</option>
              <option v-for="t in INQUIRER_TYPES" :key="t" :value="t">{{ INQUIRER_LABEL[t] }}</option>
            </select>
          </div>
          <div class="field">
            <label for="inquiryType">Inquiry Type <span class="req">*</span></label>
            <select id="inquiryType" v-model="form.inquiryType" :disabled="!form.inquirerType">
              <option value="" disabled>{{ form.inquirerType ? "-" : "Select \"I am a\" first" }}</option>
              <option v-for="opt in inquiryTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div class="field">
            <label for="message">Additional details <span class="optional">(optional)</span></label>
            <textarea id="message" rows="3" v-model="form.message"></textarea>
          </div>

          <label class="consent">
            <input type="checkbox" v-model="form.consent" />
            <span>{{ CONSENT_TEXT }}</span>
          </label>

          <p v-if="error" class="error">{{ error }}</p>
          <button type="submit" class="primary submit" :disabled="!canSubmit || submitting">
            {{ submitting ? "Submitting…" : "Submit" }}
          </button>
        </form>
      </section>

      <div class="staff">
        <button type="button" class="staff__btn" @click="goStaff">{{ auth.isAuthenticated ? "Go to App" : "Sign In" }}</button>
        <p class="staff__hint">For Ortigas Land leasing staff</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.landing { min-height: 100vh; background: var(--paper); color: var(--text); display: flex; flex-direction: column; }
.landing__bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 1.5rem; height: 60px; background: var(--ink-900); color: #e7f1ea;
}
.brand { display: flex; align-items: baseline; gap: 0.45rem; }
.brand__mark { font-family: var(--display); font-weight: 600; font-size: 1.35rem; color: #fff; line-height: 1; }
.brand__sub { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.2em; color: #7fa08f; }
.staff { text-align: center; margin-top: 0.25rem; }
.staff__btn {
  display: inline-block; min-width: 240px;
  background: var(--accent); color: #fff; border: none;
  font-size: 1.05rem; font-weight: 700; padding: 0.75rem 2rem;
  border-radius: 8px; cursor: pointer; box-shadow: var(--shadow-sm);
}
.staff__btn:hover { background: var(--accent-600); }
.staff__hint { color: var(--muted); font-size: 0.8rem; margin: 0.65rem 0 0; }
.landing__main {
  flex: 1; width: 100%; max-width: 640px; margin: 0 auto;
  padding: 2.5rem 1.5rem 3.5rem; display: flex; flex-direction: column; gap: 1.75rem;
}
.eyebrow { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--accent-text); margin: 0 0 0.5rem; font-weight: 700; }
.intro h1 { font-family: var(--display); font-size: 2.2rem; font-weight: 500; margin: 0 0 0.5rem; }
.lede { color: var(--muted); margin: 0; }
.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow-sm); padding: 1.75rem;
}
form { display: flex; flex-direction: column; gap: 1.05rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: var(--muted); }
.req { color: var(--danger); font-weight: 700; }
.optional { font-weight: 400; text-transform: none; letter-spacing: 0; }
.field select:disabled { opacity: 0.6; cursor: not-allowed; }
.field input, .field select, .field textarea {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.6rem 0.7rem; width: 100%;
}
.field textarea { resize: vertical; }
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050);
}
.consent { display: flex; gap: 0.65rem; align-items: flex-start; font-size: 0.8rem; color: var(--muted); line-height: 1.45; cursor: pointer; }
.consent input { margin-top: 0.2rem; flex-shrink: 0; }
.submit { align-self: flex-start; }
.primary {
  background: var(--accent); color: #fff; border: 1px solid transparent; box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm); padding: 0.65rem 1.1rem; font: inherit; font-weight: 550; cursor: pointer;
}
.primary:hover { background: var(--accent-600); }
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.error { margin: 0; color: var(--danger); background: var(--danger-050); border-radius: var(--radius-sm); padding: 0.6rem 0.75rem; font-size: 0.88rem; }
.thanks { text-align: center; display: flex; flex-direction: column; gap: 0.85rem; align-items: center; padding: 1rem 0; }
.thanks h2 { font-family: var(--display); font-weight: 500; font-size: 1.6rem; margin: 0; }
.thanks p { color: var(--muted); margin: 0; }
</style>
