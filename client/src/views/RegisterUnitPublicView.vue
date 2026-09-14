<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { publicRefs } from "../lib/resource.js";
import PublicShell from "../components/PublicShell.vue";
import OnboardingProgress from "../components/OnboardingProgress.vue";

// The unit comes first: this page is reached from the landing card that
// promises "List your unit". Nothing reaches the server until the final
// submit, so an application is either complete or never started.
const DRAFT_KEY = "rbu.lessorApplication";
const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "3 Bedrooms Bi-level", "Penthouse"];

const step = ref(1);
const unit = ref({ estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "", type: "", baseRent: "" });
const estateOptions = ref([]);
const towerOptions = ref([]);

const name = ref(""); const username = ref(""); const contactEmail = ref("");
const password = ref(""); const confirm = ref(""); const consent = ref(false);
const showPassword = ref(false); const showConfirm = ref(false);

const submitting = ref(false); const submitted = ref(false);
const formError = ref(""); const errors = ref({});

// Only the unit is persisted. The password lives in component state and must
// never reach storage. A blank unit number is never worth persisting — it
// would blow away a legitimate draft the moment the field is cleared while
// editing, so an in-progress edit that has not yet re-typed a unit number
// leaves the last saved draft alone.
watch(unit, (u) => {
  if (!u.unitNumber.trim()) return;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ unit: u }));
}, { deep: true });

onMounted(async () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (saved?.unit) unit.value = { ...unit.value, ...saved.unit };
  } catch { /* a corrupt draft is not worth failing the page over */ }
  estateOptions.value = await publicRefs.estates();
  // A restored draft can already carry an estateId — without this, the tower
  // list stays empty and the saved tower renders as an unselected blank.
  if (unit.value.estateId) towerOptions.value = await publicRefs.towers(unit.value.estateId);
});

async function onEstateChange() {
  unit.value.towerId = "";
  towerOptions.value = unit.value.estateId ? await publicRefs.towers(unit.value.estateId) : [];
}

watch(() => unit.value.unitNumber, () => delete errors.value.unitNumber);
watch(name, () => delete errors.value.name);
watch(username, () => delete errors.value.username);
watch(contactEmail, () => delete errors.value.contactEmail);
watch(password, () => { delete errors.value.password; delete errors.value.confirm; });
watch(confirm, () => delete errors.value.confirm);
watch(consent, () => delete errors.value.consent);

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

const submitLabel = computed(() => {
  if (step.value === 1) return "Continue to your account";
  return submitting.value ? "Submitting…" : "Submit application";
});

function validateUnit() {
  const e = {};
  if (!unit.value.unitNumber.trim()) e.unitNumber = "Unit number is required.";
  errors.value = e;
  return Object.keys(e).length === 0;
}

function validateAccount() {
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

function submit() {
  formError.value = "";
  if (step.value === 1) {
    if (!validateUnit()) return;
    step.value = 2;
    return;
  }
  if (!validateAccount()) return;
  return send();
}

function unitPayload() {
  const u = { unitNumber: unit.value.unitNumber.trim() };
  for (const k of ["towerId", "floor", "slotNo", "type"]) {
    if (unit.value[k]) u[k] = String(unit.value[k]).trim();
  }
  if (unit.value.estateId) u.estateId = unit.value.estateId;
  if (unit.value.baseRent !== "") u.baseRent = Number(unit.value.baseRent);
  return u;
}

async function send() {
  submitting.value = true;
  try {
    await api.post("/auth/signup", {
      name: name.value.trim(),
      email: username.value.trim(),
      contactEmail: contactEmail.value.trim(),
      password: password.value,
      role: "UNIT_OWNER",
      consent: true,
      unit: unitPayload(),
    });
    sessionStorage.removeItem(DRAFT_KEY);
    submitted.value = true;
  } catch (e) {
    formError.value = e.response?.data?.error || "Could not submit your application.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <PublicShell main-label="List your unit" skip-label="Skip to the form" narrow footer="slim">
    <template #nav-actions>
      <RouterLink to="/login" class="nav__signin">Sign in</RouterLink>
    </template>

    <div class="auth">
      <div class="auth__card">

        <!-- Submitted: the application is on file but not yet reviewed. -->
        <div v-if="submitted" class="done">
          <h1>Application received</h1>
          <p class="done__status">Status: <strong>Pending Review</strong></p>
          <p class="done__body">
            Thanks, {{ name.trim() }}. Our leasing team will review your unit and account
            details shortly. You can sign in any time to check your application's status —
            that's the only place the answer will appear, since we don't send any updates by email.
          </p>
          <RouterLink class="done__link" to="/login">Check your application status</RouterLink>
        </div>

        <template v-else>
          <h1>List your unit</h1>
          <p class="step-status" aria-live="polite">Step {{ step }} of 2: {{ step === 1 ? "Your unit" : "Your account" }}</p>

          <OnboardingProgress :current="step === 1 ? 'unit' : 'account'" class="prog" />

          <form @submit.prevent="submit" novalidate>
            <div v-if="step === 1" class="unit">
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
                  <option value="">{{ unit.estateId ? "Select…" : "Select an estate first" }}</option>
                  <option v-for="t in towerOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>

              <div class="field">
                <label for="unitNumber">Unit number <span class="req">*</span></label>
                <input id="unitNumber" type="text" v-model="unit.unitNumber" placeholder="e.g. 19A" />
                <p v-if="errors.unitNumber" class="err">{{ errors.unitNumber }}</p>
                <p v-else class="hint">As written on the door — floor plus letter, like 19A or 5I.</p>
              </div>

              <div class="field">
                <label for="floor">Floor / level</label>
                <input id="floor" type="text" v-model="unit.floor" placeholder="e.g. 19" />
              </div>

              <div class="field">
                <label for="type">Unit type</label>
                <input id="type" type="text" v-model="unit.type" list="registerUnitTypes" placeholder="e.g. 1 Bedroom" />
                <datalist id="registerUnitTypes">
                  <option v-for="t in UNIT_TYPES" :key="t" :value="t"></option>
                </datalist>
              </div>

              <div class="field field--rent">
                <label for="baseRent">Monthly rent</label>
                <div class="money">
                  <span class="money__sign" aria-hidden="true">₱</span>
                  <input id="baseRent" type="number" min="0" step="500" v-model="unit.baseRent" placeholder="e.g. 25000" />
                </div>
                <p class="hint">Per month, excluding association dues. You can adjust this later.</p>
              </div>

              <div class="field">
                <label for="slotNo">Parking slot no. <span class="opt">(optional)</span></label>
                <input id="slotNo" type="text" v-model="unit.slotNo" placeholder="e.g. B5-15" />
              </div>
            </div>

            <div v-else class="step2">
              <p class="unit__lede">Now let's set up your account. Your unit will be attached to it once approved.</p>

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

              <button type="button" class="step2__back" @click="step = 1; formError = ''">Back</button>
            </div>

            <button type="submit" :disabled="submitting">{{ submitLabel }}</button>
            <p v-if="formError" class="error">{{ formError }}</p>
            <p class="approve-note">Applications are reviewed by the leasing team before they can be used.</p>
          </form>
        </template>

        <p v-if="!submitted" class="auth__alt">Already have an account? <RouterLink to="/login">Sign in</RouterLink></p>
      </div>
    </div>
  </PublicShell>
</template>

<style scoped>
.auth__alt { margin: 1rem 0 0; font-size: 0.85rem; color: var(--muted); text-align: center; }
.auth__alt a { color: var(--accent-text); font-weight: 550; }

.step-status { margin: 0.35rem 0 0; font-size: 0.78rem; color: var(--muted); }
.prog { margin: 0.35rem 0 1.25rem; }

.fld { display: flex; flex-direction: column; gap: 0.25rem; }
.fld__err { margin: 0; font-size: 0.76rem; color: var(--danger); }
.fld__hint { margin: 0; font-size: 0.72rem; color: var(--faint); }

.pw-wrap { position: relative; display: flex; }
.pw-wrap input { padding-right: 2.9rem; }
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

.unit__lede { margin: 0 0 1.1rem; font-size: 0.88rem; color: var(--muted); }
.step2__back {
  background: none; border: none; padding: 0; margin: 0.15rem 0 0; font: inherit; font-size: 0.85rem;
  color: var(--accent-text); text-decoration: underline; cursor: pointer;
}

/* This page renders outside `.app-main`, so the staff-facing `.field` rules
   don't reach it — mirror RegisterUnitView's own field styling instead. */
.unit .field, .step2 { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; }
.unit .field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: var(--muted); }
.unit .req { color: var(--danger); }
.unit .opt { color: var(--faint); font-weight: 400; }
.unit .field select {
  font-family: inherit; font-size: 1rem; color: var(--text); background: var(--paper);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.85rem 0.9rem; width: 100%;
}
.unit .field select:focus { outline: none; border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-050); }
.unit .field select:disabled { opacity: 0.55; cursor: not-allowed; }
.unit .err { margin: 0.15rem 0 0; font-size: 0.76rem; color: var(--danger); }
.unit .hint { margin: 0.15rem 0 0; font-size: 0.72rem; color: var(--faint); line-height: 1.35; }

.money { position: relative; display: flex; }
.money__sign {
  position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%);
  color: var(--muted); font-size: 0.95rem; pointer-events: none;
}
.money input { padding-left: 1.75rem; width: 100%; }
.money { max-width: 240px; }

.done { text-align: center; }
.done__status { font-size: 0.85rem; font-weight: 700; color: var(--accent-text); margin: 0.5rem 0 0; }
.done__body { color: var(--muted); font-size: 0.9rem; line-height: 1.6; margin: 0.5rem 0 0.75rem; }
.done__note { font-size: 0.82rem; color: var(--muted); margin: 0 0 1.1rem; }
.done__link { color: var(--accent-text); font-weight: 600; font-size: 0.88rem; text-decoration: none; }
.done__link:hover { text-decoration: underline; }
</style>
