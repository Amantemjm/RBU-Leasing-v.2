<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { useAuthStore } from "../stores/auth.js";

const email = ref(""); const password = ref(""); const error = ref("");
const router = useRouter(); const auth = useAuthStore();

async function submit() {
  error.value = "";
  try {
    const { data } = await api.post("/auth/login", { email: email.value, password: password.value });
    auth.setSession(data);
    router.push("/");
  } catch {
    error.value = "Invalid email or password.";
  }
}
</script>

<template>
  <div class="auth">
    <div class="auth__card">
      <div class="auth__brand">RBU Leasing</div>
      <p class="auth__eyebrow">Residential Business Unit</p>
      <h1>Sign in to your account</h1>
      <form @submit.prevent="submit">
        <input v-model="email" type="email" placeholder="Email" autocomplete="username" />
        <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" />
        <button type="submit">Log in</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>
