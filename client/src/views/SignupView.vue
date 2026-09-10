<script setup>
import { ref, computed, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../lib/api.js";
import { publicRefs } from "../lib/resource.js";
import PublicShell from "../components/PublicShell.vue";
// The brand lockup comes from the shell's header; the card used to repeat it.

// Preselect the role from ?as= (LESSOR → Unit Owner, LESSEE → Tenant); the
// toggle stays user-editable. Defaults to Tenant.
const route = useRoute();
const role = ref(route.query.as === "LESSOR" ? "UNIT_OWNER" : "TENANT");
const name = ref("");
const username = ref("");
const contactEmail = ref("");
const password = ref("");
const confirm = ref("");
const consent = ref(false);

// A lessor is asked for their first unit after the account details — the
// landing card promised "List your unit", and a unit cannot exist until the
// account is approved, so it rides along on the application.
const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "3 Bedrooms Bi-level", "Penthouse"];
const isLessor = computed(() => role.value === "UNIT_OWNER");
const step = ref(1);
const unit = ref({ estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "", type: "", baseRent: "" });
const estateOptions = ref([]);
const towerOptions = ref([]);
const savedUnit = ref(null); // what was actually submitted, for the confirmation

// Changing the role on step 1 must not strand a tenant on the lessor step.
watch(role, () => { if (!isLessor.value) step.value = 1; });
watch(() => unit.value.unitNumber, () => delete errors.value.unitNumber);

async function enterUnitStep() {
  step.value = 2;
  estateOptions.value = await publicRefs.estates();
}
async function onEstateChange() {
  unit.value.towerId = "";
  towerOptions.value = unit.value.estateId ? await publicRefs.towers(unit.value.estateId) : [];
}

const showPassword = ref(false);
const showConfirm = ref(false);
const submitting = ref(false);
const submitted = ref(false);
const formError = ref("");
// Per-field messages: one lumped error could not say which field was wrong.
const errors = ref({});

// There is no password-reset flow in this system, so a typo here locks the
// applicant out permanently. Hence both the confirm field and the eye toggles.
const strength = computed(() => {
  const p = password.value;
  if (!p) return null;
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 2) return { level: "weak", label: "Weak" };
  if (score === 3) return { level: "fair", label: "Fair" };
  return { level: "strong", label: "Strong" };
});

// Clear a field's error as soon as it is edited. Without this, an error raised
// on submit stays on screen while the user fixes it — and because the strength
// meter renders in the error's v-else branch, it would never appear again.
watch(name, () => delete errors.value.name);
watch(username, () => delete errors.value.username);
watch(contactEmail, () => delete errors.value.contactEmail);
watch(password, () => { delete errors.value.password; delete errors.value.confirm; });
watch(confirm, () => delete errors.value.confirm);
watch(consent, () => delete errors.value.consent);

function validate() {
  const e = {};
  if (!name.value.trim()) e.name = "Enter your full name.";
  if (username.value.trim().length < 3) e.username = "Username must be at least 3 characters.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail.value.trim())) e.contactEmail = "Enter a valid email address.";
  if (password.value.length < 8) e.password = "Password must be at least 8 characters.";
  if (confirm.value !== password.value) e.confirm = "Passwords do not match.";
  if (!consent.value) e.consent = "Please agree before continuing.";
  errors.value = e;
  return Object.keys(e).length === 0;
}

async function submit() {
  formError.value = "";
  if (step.value === 1) {
    if (!validate()) return;
    if (isLessor.value) return enterUnitStep();
    return sendApplication(null);
  }
  if (!unit.value.unitNumber.trim()) {
    errors.value = { ...errors.value, unitNumber: "Unit number is required." };
    return;
  }
  const u = { unitNumber: unit.value.unitNumber.trim() };
  for (const k of ["estateId", "towerId", "floor", "slotNo", "type"]) {
    if (unit.value[k]) u[k] = String(unit.value[k]).trim();
  }
  if (unit.value.baseRent !== "") u.baseRent = Number(unit.value.baseRent);
  return sendApplication(u);
}

async function sendApplication(unitPayload) {
  submitting.value = true;
  try {
    const payload = {
      name: name.value.trim(),
      email: username.value.trim(),
      contactEmail: contactEmail.value.trim(),
      password: password.value,
      role: role.value,
      consent: true,
    };
    if (unitPayload) payload.unit = unitPayload;
    await api.post("/auth/signup", payload);
    savedUnit.value = unitPayload;
    submitted.value = true;
  } catch (e) {
    formError.value = e.response?.data?.error || "Could not submit your application.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <PublicShell main-label="Create your account" skip-label="Skip to the form" narrow footer="slim">
    <template #nav-actions>
      <RouterLink to="/login" class="nav__signin">Sign in</RouterLink>
    </template>

    <div class="auth">
      <div class="auth__card">

        <!-- Submitted: the account exists but cannot be used until approved. -->
        <div v-if="submitted" class="done">
          <h1>Application received</h1>
          <p class="done__body">
            Thanks, {{ name.trim() }}. Our leasing team will review your account request and
            approve it shortly. You will not be able to sign in until it is approved.
          </p>
          <p class="done__note">We will reach you at <strong>{{ contactEmail.trim() }}</strong>.</p>
          <p v-if="savedUnit" class="done__note">
            We have your unit <strong>{{ savedUnit.unitNumber }}</strong> on file. It will appear under
            My Units once your account is approved.
          </p>
          <RouterLink class="done__link" to="/login">Back to sign in</RouterLink>
        </div>

        <template v-else>
          <h1>Create your account</h1>

          <div class="roles">
            <button type="button" :class="{ on: role === 'UNIT_OWNER' }" @click="role = 'UNIT_OWNER'">
              <span class="roles__t">I'm a Lessor</span>
              <span class="roles__s">Unit Owner</span>
            </button>
            <button type="button" :class="{ on: role === 'TENANT' }" @click="role = 'TENANT'">
              <span class="roles__t">I'm a Lessee</span>
              <span class="roles__s">Prospective Tenant</span>
            </button>
          </div>

          <form @submit.prevent="submit" novalidate>
            <div v-if="step === 1" class="step1">
            <div class="fld">
              <input id="name" v-model="name" type="text" placeholder="Full name" autocomplete="name" />
              <p v-if="errors.name" class="fld__err">{{ errors.name }}</p>
            </div>

            <div class="fld">
              <input id="username" v-model="username" type="text" placeholder="Username" autocomplete="username" />
              <p v-if="errors.username" class="fld__err">{{ errors.username }}</p>
            </div>

            <div class="fld">
              <input id="contactEmail" v-model="contactEmail" type="email" placeholder="Email address" autocomplete="email" />
              <p v-if="errors.contactEmail" class="fld__err">{{ errors.contactEmail }}</p>
              <p v-else class="fld__hint">So the leasing team can reach you about your application.</p>
            </div>

            <div class="fld">
              <div class="pw-wrap">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Password (8+ characters)"
                  autocomplete="new-password"
                />
                <button
                  type="button" class="pw-toggle"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.password" class="fld__err">{{ errors.password }}</p>
              <p v-else-if="strength" class="strength" :class="'is-' + strength.level">
                <span class="strength__bar"><span></span></span>{{ strength.label }}
              </p>
            </div>

            <div class="fld">
              <div class="pw-wrap">
                <input
                  id="confirm"
                  v-model="confirm"
                  :type="showConfirm ? 'text' : 'password'"
                  placeholder="Confirm password"
                  autocomplete="new-password"
                />
                <button
                  type="button" class="pw-toggle"
                  :aria-label="showConfirm ? 'Hide password' : 'Show password'"
                  :aria-pressed="showConfirm"
                  @click="showConfirm = !showConfirm"
                >
                  <svg v-if="!showConfirm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.confirm" class="fld__err">{{ errors.confirm }}</p>
            </div>

            <label class="consent">
              <input id="consent" type="checkbox" v-model="consent" />
              <span>I consent to Ortigas and Company collecting and processing my details for this leasing application.</span>
            </label>
            <p v-if="errors.consent" class="fld__err">{{ errors.consent }}</p>
            </div>

            <div v-if="step === 2" class="unit">
              <h2 class="unit__h">Your unit</h2>
              <p class="unit__lede">Tell us about the unit you would like to list. You can change any of this later.</p>

              <div class="field">
                <label for="estateId">Estate</label>
                <select id="estateId" v-model="unit.estateId" @change="onEstateChange">
                  <option value="">Select…</option>
                  <option v-for="e in estateOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
                </select>
              </div>

              <div class="field">
                <label for="towerId">Tower</label>
                <select id="towerId" v-model="unit.towerId" :disabled="!unit.estateId">
                  <option value="">Select…</option>
                  <option v-for="t in towerOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>

              <div class="field">
                <label for="unitNumber">Unit number <span class="req">*</span></label>
                <input id="unitNumber" type="text" v-model="unit.unitNumber" placeholder="e.g. 19A" />
                <p v-if="errors.unitNumber" class="err">{{ errors.unitNumber }}</p>
              </div>

              <div class="field">
                <label for="floor">Floor / level</label>
                <input id="floor" type="text" v-model="unit.floor" placeholder="e.g. 19" />
              </div>

              <div class="field">
                <label for="type">Unit type</label>
                <input id="type" type="text" v-model="unit.type" list="signupUnitTypes" placeholder="e.g. 1 Bedroom" />
                <datalist id="signupUnitTypes">
                  <option v-for="t in UNIT_TYPES" :key="t" :value="t"></option>
                </datalist>
              </div>

              <div class="field">
                <label for="baseRent">Monthly rent</label>
                <input id="baseRent" type="number" min="0" step="500" v-model="unit.baseRent" placeholder="e.g. 25000" />
              </div>

              <div class="field">
                <label for="slotNo">Parking slot no.</label>
                <input id="slotNo" type="text" v-model="unit.slotNo" placeholder="e.g. B5-15" />
              </div>

              <button type="button" class="unit__skip" @click="sendApplication(null)">
                Skip for now — I'll add it after approval
              </button>
            </div>

            <button type="submit" :disabled="submitting">{{ step === 1 && isLessor ? "Continue" : step === 2 ? "Submit application" : "Create account" }}</button>
            <p v-if="formError" class="error">{{ formError }}</p>
            <p class="approve-note">Accounts are reviewed by the leasing team before they can be used.</p>
          </form>
        </template>

        <p v-if="!submitted" class="auth__alt">Already have an account? <RouterLink to="/login">Sign in</RouterLink></p>
      </div>
    </div>
  </PublicShell>
</template>

<style scoped>
.roles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin: 0.25rem 0 1rem; }
.roles button {
  display: flex; flex-direction: column; gap: 0.1rem; align-items: flex-start;
  background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  padding: 0.6rem 0.75rem; cursor: pointer; font: inherit; text-align: left; transition: border-color 0.14s ease, background 0.14s ease;
}
.roles button:hover { border-color: var(--muted); }
.roles button.on { border-color: var(--accent); background: var(--accent-050); }
.roles__t { font-size: 0.9rem; font-weight: 600; color: var(--text); }
.roles__s { font-size: 0.72rem; color: var(--muted); }
.roles button.on .roles__t { color: var(--accent-text); }
.auth__alt { margin: 1rem 0 0; font-size: 0.85rem; color: var(--muted); text-align: center; }
.auth__alt a { color: var(--accent-text); font-weight: 550; }

.fld { display: flex; flex-direction: column; gap: 0.25rem; }
.fld__err { margin: 0; font-size: 0.76rem; color: var(--danger); }
.fld__hint { margin: 0; font-size: 0.72rem; color: var(--faint); }

.pw-wrap { position: relative; display: flex; }
.pw-wrap input { padding-right: 2.9rem; }
/* Inert on hover: .auth button lifts and fills green, which would throw this
   icon out of its translateY(-50%) centring. Pin everything that rule sets. */
.pw-toggle {
  position: absolute; top: 50%; right: 0.5rem; transform: translateY(-50%);
  width: auto; margin: 0; box-shadow: none;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.35rem; border: none; background: none; color: var(--muted);
  cursor: pointer; border-radius: var(--radius-sm);
}
.pw-toggle:hover, .pw-toggle:active, .pw-toggle:focus {
  background: none; box-shadow: none; transform: translateY(-50%); color: var(--muted);
}
.pw-toggle:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; box-shadow: none; transform: translateY(-50%); }
.pw-toggle svg { width: 18px; height: 18px; display: block; }

.strength { margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; color: var(--muted); }
.strength__bar { flex: 1; height: 4px; border-radius: 999px; background: var(--line); overflow: hidden; }
.strength__bar span { display: block; height: 100%; border-radius: 999px; transition: width var(--dur-2) var(--ease-out), background var(--dur-2) var(--ease-out); }
.strength.is-weak .strength__bar span { width: 33%; background: var(--danger); }
.strength.is-fair .strength__bar span { width: 66%; background: var(--warn); }
.strength.is-strong .strength__bar span { width: 100%; background: var(--good); }

.consent {
  display: flex; gap: 0.6rem; align-items: flex-start; font-size: 0.78rem; color: var(--muted);
  line-height: 1.45; cursor: pointer; background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--radius-sm); padding: 0.55rem 0.7rem; margin-top: 0.15rem;
}
.consent input { margin-top: 0.15rem; flex-shrink: 0; width: 16px; height: 16px; accent-color: var(--accent); }

.approve-note { margin: 0.6rem 0 0; font-size: 0.74rem; color: var(--faint); text-align: center; }

/* The step-1 wrapper only exists to gate the account fields behind v-if; it
   must not itself become a flex item, or the fields inside it lose the
   0.9rem gap that `.auth form` applies to its direct children. */
.step1 { display: contents; }

.unit__h { margin: 0 0 0.35rem; font-size: 1.05rem; }
.unit__lede { margin: 0 0 1.1rem; font-size: 0.88rem; color: var(--muted); }
.unit__skip {
  background: none; border: none; padding: 0; margin-top: 0.5rem; font: inherit; font-size: 0.85rem;
  color: var(--accent-text); text-decoration: underline; cursor: pointer;
}

/* This page renders outside `.app-main`, so the staff-facing `.field` rules
   don't reach it — mirror InquiryView's own field styling instead. Plain
   `<input>`s already pick up `.auth input` above; `<select>` needs its own. */
.unit .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; }
.unit .field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: var(--muted); }
.unit .req { color: var(--danger); }
.unit .field select {
  font-family: inherit; font-size: 1rem; color: var(--text); background: var(--paper);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.85rem 0.9rem; width: 100%;
}
.unit .field select:focus { outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050); }
.unit .field select:disabled { opacity: 0.55; cursor: not-allowed; }
.unit .err { margin: 0.15rem 0 0; font-size: 0.76rem; color: var(--danger); }

.done { text-align: center; }
.done__body { color: var(--muted); font-size: 0.9rem; line-height: 1.6; margin: 0.5rem 0 0.75rem; }
.done__note { font-size: 0.82rem; color: var(--muted); margin: 0 0 1.1rem; }
.done__link { color: var(--accent-text); font-weight: 600; font-size: 0.88rem; text-decoration: none; }
.done__link:hover { text-decoration: underline; }
</style>
