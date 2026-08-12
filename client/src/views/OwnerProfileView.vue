<script setup>
import { ref, onMounted } from "vue";
import { ownerMe } from "../lib/resource.js";

const owner = ref(null);
const error = ref("");

onMounted(async () => {
  try {
    owner.value = await ownerMe();
  } catch (e) {
    error.value = e.response?.data?.error || "No owner profile is linked to this account.";
  }
});
</script>

<template>
  <section>
    <header><h1>My Profile</h1></header>
    <p v-if="error" class="muted">{{ error }}</p>
    <dl v-else-if="owner" class="profile">
      <div><dt>Name</dt><dd>{{ owner.name }}</dd></div>
      <div><dt>Email</dt><dd>{{ owner.email || "—" }}</dd></div>
      <div><dt>Phone</dt><dd>{{ owner.phone || "—" }}</dd></div>
      <div><dt>Address</dt><dd>{{ owner.address || "—" }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.profile {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow-sm); padding: 1.5rem; max-width: 480px; margin: 0;
  display: grid; gap: 1rem;
}
.profile div { display: grid; gap: 0.25rem; }
.profile dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
.profile dd { margin: 0; font-size: 0.98rem; }
</style>
