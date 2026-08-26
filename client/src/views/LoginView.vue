<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { useAuthStore } from "../stores/auth.js";
import logoUrl from "../assets/ortigas-logo.svg";

const email = ref(""); const password = ref(""); const error = ref("");
// Let people check what they typed before submitting — long or generated
// passwords are easy to mistype, and the error message cannot say which field
// was wrong. Starts masked; never persists across a page load.
const showPassword = ref(false);
const router = useRouter(); const auth = useAuthStore();

async function submit() {
  error.value = "";
  try {
    const { data } = await api.post("/auth/login", { email: email.value, password: password.value });
    auth.setSession(data);
    const home = auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app";
    router.push(home);
  } catch (e) {
    // A pending or rejected account is a different situation from bad
    // credentials, and the server says which — passing it through avoids
    // applicants retyping a password that was never the problem.
    const code = e.response?.data?.code;
    error.value = code === "ACCOUNT_PENDING" || code === "ACCOUNT_REJECTED"
      ? e.response.data.error
      : "Invalid username or password.";
  }
}
</script>

<template>
  <div class="auth">
    <div class="auth__card">
      <img :src="logoUrl" class="auth__logo" alt="Ortigas Land" style="width:52px;height:52px;display:block;margin:0 auto 0.6rem;" />
      <div class="auth__brand">RBU Leasing</div>
      <p class="auth__eyebrow">Residential Business Unit</p>
      <h1>Sign in to your account</h1>
      <form @submit.prevent="submit">
        <input id="username" v-model="email" type="text" placeholder="Username" autocomplete="username" />
        <div class="pw-wrap">
          <input
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Password"
            autocomplete="current-password"
          />
          <button
            type="button"
            class="pw-toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>
        <button type="submit">Log in</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
      <p class="auth__alt">Lessor or lessee? <router-link to="/signup">Create an account</router-link></p>
    </div>
  </div>
</template>

<style scoped>
.pw-wrap { position: relative; display: flex; }
/* Room for the eye so long passwords never run under it. */
.pw-wrap input { padding-right: 2.9rem; }
.pw-toggle {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  /* .auth button in app.css is a full-width submit button; this one is an icon
     inside the field, so width/margin/shadow have to be reset explicitly. */
  width: auto;
  margin: 0;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem;
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
/* Deliberately inert: the icon must not move, tint or lift on hover. It shares
   the .auth button selector with the full-width submit button, which lifts on
   hover (translateY(-1px)) — that overrode the translateY(-50%) centring here
   and threw the icon out of the field. Every property that rule touches is
   pinned back, on hover and active alike. */
.pw-toggle:hover,
.pw-toggle:active,
.pw-toggle:focus {
  background: none;
  box-shadow: none;
  transform: translateY(-50%);
  color: var(--muted);
}
/* Keyboard focus still needs to be visible — that is not a hover effect. */
.pw-toggle:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 1px;
  box-shadow: none;
  transform: translateY(-50%);
}
.pw-toggle svg { width: 18px; height: 18px; display: block; }
</style>
