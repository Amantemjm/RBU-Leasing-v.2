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
  <form @submit.prevent="submit">
    <h1>RBU Leasing — Sign in</h1>
    <input v-model="email" type="email" placeholder="Email" />
    <input v-model="password" type="password" placeholder="Password" />
    <button type="submit">Log in</button>
    <p v-if="error">{{ error }}</p>
  </form>
</template>
