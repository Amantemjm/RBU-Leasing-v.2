<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import logoUrl from "../assets/ortigas-logo.svg";

const router = useRouter();
const auth = useAuthStore();

const appHome = computed(() =>
  auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app",
);
function goStaff() {
  router.push(auth.isAuthenticated ? appHome.value : "/login");
}

// Carry the chosen user type to the Quick Inquiry page via the URL.
function select(as) {
  router.push({ path: "/inquiry", query: { as } });
}
</script>

<template>
  <div class="landing">
    <header class="landing__bar">
      <div class="brand">
        <img :src="logoUrl" class="brand__logo" alt="Ortigas Land" />
        <span class="brand__name">Ortigas Land</span>
        <span class="brand__sub">Leasing</span>
      </div>
    </header>

    <main class="landing__main">
      <section class="intro">
        <p class="eyebrow">Ortigas Land · Residential &amp; Office Leasing</p>
        <h1>Quick Inquiry</h1>
        <p class="lede">To get started, tell us who you are.</p>
      </section>

      <section class="choose">
        <h2 class="choose__q">I am a…</h2>
        <div class="choices">
          <button type="button" class="choice" @click="select('LESSOR')">
            <span class="choice__title">Lessor / Unit Owner</span>
            <span class="choice__desc">The owner or authorized representative of a property who is looking to lease out their unit or property.</span>
            <span class="choice__go">Continue →</span>
          </button>
          <button type="button" class="choice" @click="select('LESSEE')">
            <span class="choice__title">Lessee / Tenant</span>
            <span class="choice__desc">A person or organization looking to rent or lease a property.</span>
            <span class="choice__go">Continue →</span>
          </button>
        </div>
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
.landing__bar { display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; height: 60px; background: var(--ink-900); color: #e7f1ea; }
.brand { display: flex; align-items: center; gap: 0.5rem; }
.brand__logo { width: 28px; height: 28px; display: block; }
.brand__name { font-family: var(--display); font-weight: 600; font-size: 1.25rem; color: #fff; line-height: 1; }
.brand__sub { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.2em; color: #7fa08f; align-self: flex-end; padding-bottom: 0.2rem; }
.landing__main { flex: 1; width: 100%; max-width: 640px; margin: 0 auto; padding: 2.5rem 1.5rem 3.5rem; display: flex; flex-direction: column; gap: 1.75rem; }
.eyebrow { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--accent-text); margin: 0 0 0.5rem; font-weight: 700; }
.intro h1 { font-family: var(--display); font-size: 2.2rem; font-weight: 500; margin: 0 0 0.5rem; }
.lede { color: var(--muted); margin: 0; }
.choose__q { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; margin: 0 0 0.9rem; }
.choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
.choice {
  display: flex; flex-direction: column; gap: 0.5rem; text-align: left; cursor: pointer;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow-sm); padding: 1.35rem 1.4rem; transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.choice:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(0,0,0,0.09); border-color: var(--accent); }
.choice__title { font-family: var(--display); font-size: 1.2rem; font-weight: 600; color: var(--ink-800); }
.choice__desc { color: var(--muted); font-size: 0.9rem; line-height: 1.5; flex: 1; }
.choice__go { color: var(--accent-text); font-weight: 700; font-size: 0.85rem; margin-top: 0.2rem; }
.staff { text-align: center; margin-top: 0.5rem; }
.staff__btn { display: inline-block; min-width: 240px; background: var(--accent); color: #fff; border: none; font-size: 1.05rem; font-weight: 700; padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer; box-shadow: var(--shadow-sm); }
.staff__btn:hover { background: var(--accent-600); }
.staff__hint { color: var(--muted); font-size: 0.8rem; margin: 0.65rem 0 0; }
</style>
