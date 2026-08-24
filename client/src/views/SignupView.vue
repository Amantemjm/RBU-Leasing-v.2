<script setup>
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { useAuthStore } from "../stores/auth.js";
import logoUrl from "../assets/ortigas-logo.svg";

const role = ref("TENANT"); // "TENANT" (lessee) | "UNIT_OWNER" (lessor)
const name = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const submitting = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function submit() {
  error.value = "";
  if (!name.value.trim() || email.value.trim().length < 3 || password.value.length < 6) {
    error.value = "Enter your name, a username (3+ characters), and a password (6+ characters).";
    return;
  }
  submitting.value = true;
  try {
    const { data } = await api.post("/auth/signup", {
      name: name.value.trim(), email: email.value.trim(), password: password.value, role: role.value,
    });
    auth.setSession(data);
    router.push(auth.isOwner ? "/app/my-units" : "/app/my-lease");
  } catch (e) {
    error.value = e.response?.data?.error || "Could not create your account.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth">
    <div class="auth__card">
      <img :src="logoUrl" class="auth__logo" alt="Ortigas Land" style="width:52px;height:52px;display:block;margin:0 auto 0.6rem;" />
      <div class="auth__brand">Ortigas Land</div>
      <p class="auth__eyebrow">Leasing Portal</p>
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

      <form @submit.prevent="submit">
        <input v-model="name" type="text" placeholder="Full name" autocomplete="name" />
        <input v-model="email" type="text" placeholder="Username or email" autocomplete="username" />
        <input v-model="password" type="password" placeholder="Password (6+ characters)" autocomplete="new-password" />
        <button type="submit" :disabled="submitting">{{ submitting ? "Creating…" : "Create account" }}</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <p class="auth__alt">Already have an account? <RouterLink to="/login">Sign in</RouterLink></p>
    </div>
  </div>
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
</style>
