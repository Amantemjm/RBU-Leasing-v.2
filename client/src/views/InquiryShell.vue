<script setup>
// Shared premium shell for the public Quick Inquiry flow (choose role → form):
// an immersive deep-green page with slow ambient light, the brand, a two-step
// progress, and a light content card floating at the centre.
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import logoUrl from "../assets/ortigas-logo.svg";

defineProps({
  step: { type: Number, default: 1 },
  lede: { type: String, default: "" },
});

const router = useRouter();
const auth = useAuthStore();
const appHome = computed(() => (auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app"));
function goStaff() { router.push(auth.isAuthenticated ? appHome.value : "/login"); }
</script>

<template>
  <div class="iq">
    <div class="iq__glows" aria-hidden="true"><span></span><span></span><span></span></div>

    <header class="iq__bar">
      <div class="brand">
        <img :src="logoUrl" class="brand__logo" alt="Ortigas Land" />
        <span class="brand__name">Ortigas Land</span>
        <span class="brand__sub">Leasing</span>
      </div>
      <button type="button" class="signin" @click="goStaff">
        {{ auth.isAuthenticated ? "Go to app" : "Staff sign in" }}
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </header>

    <main class="iq__body">
      <div class="iq__intro">
        <p class="eyebrow rise" style="--d:0">Residential &amp; Office Leasing</p>
        <h1 class="rise" style="--d:1">Quick Inquiry</h1>
        <p class="lede rise" style="--d:2">{{ lede || "Tell us what you're looking for — our leasing team follows up within one business day." }}</p>
        <ol class="steps rise" style="--d:3" aria-label="Progress">
          <li :class="{ on: step >= 1, done: step > 1 }"><span class="steps__dot">1</span>Who you are</li>
          <li class="steps__bar" aria-hidden="true"></li>
          <li :class="{ on: step >= 2 }"><span class="steps__dot">2</span>Your inquiry</li>
        </ol>
      </div>

      <div class="iq__card rise" style="--d:4"><slot /></div>
      <p class="iq__foot rise" style="--d:5"><slot name="foot" /></p>
    </main>
  </div>
</template>

<style scoped>
.iq {
  position: relative; overflow: hidden; min-height: 100vh; display: flex; flex-direction: column;
  background: radial-gradient(120% 90% at 12% -10%, #206b4a 0%, var(--ink-900) 52%, #0a3020 100%);
  color: #eaf3ee; font-family: var(--ui);
}
.iq__glows { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.iq__glows span {
  position: absolute; border-radius: 50%; filter: blur(70px);
  background: radial-gradient(circle, var(--brand-mint), transparent 70%); animation: drift 24s ease-in-out infinite;
}
.iq__glows span:nth-child(1) { width: 420px; height: 420px; top: -140px; left: -70px; opacity: 0.30; }
.iq__glows span:nth-child(2) { width: 360px; height: 360px; top: 30%; right: -120px; opacity: 0.22; animation-delay: -8s; }
.iq__glows span:nth-child(3) { width: 320px; height: 320px; bottom: -140px; left: 40%; opacity: 0.18; animation-delay: -15s; }
@keyframes drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(34px, 26px) scale(1.12); }
  66% { transform: translate(-26px, 14px) scale(0.94); }
}

.iq__bar {
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between;
  padding: 1.15rem 1.6rem; max-width: 1040px; margin: 0 auto; width: 100%;
}
.brand { display: flex; align-items: center; gap: 0.55rem; }
.brand__logo { width: 30px; height: 30px; display: block; filter: brightness(0) invert(1); opacity: 0.95; }
.brand__name { font-family: var(--display); font-weight: 600; font-size: 1.3rem; color: #fff; line-height: 1; white-space: nowrap; }
.brand__sub { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.22em; color: var(--brand-mint); align-self: flex-end; padding-bottom: 0.22rem; }
.signin {
  display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer;
  background: rgba(255, 255, 255, 0.08); color: #eaf3ee; border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px; padding: 0.44rem 1rem; font: inherit; font-size: 0.82rem; font-weight: 500;
  white-space: nowrap; backdrop-filter: blur(4px); transition: background 0.16s ease, border-color 0.16s ease;
}
.signin:hover { background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.35); }
.signin svg { transition: transform 0.16s ease; }
.signin:hover svg { transform: translateX(2px); }

/* centre the composition on tall screens */
.iq__body {
  position: relative; z-index: 1; flex: 1; width: 100%; max-width: 620px; margin: 0 auto;
  padding: 1.5rem 1.6rem 3rem; display: flex; flex-direction: column; justify-content: center; gap: 1.5rem;
}
.iq__intro { text-align: left; }
.eyebrow { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.2em; color: var(--brand-mint); margin: 0 0 0.7rem; font-weight: 700; }
.iq__intro h1 { font-family: var(--display); font-size: clamp(2.4rem, 6vw, 3.5rem); font-weight: 500; letter-spacing: -0.01em; margin: 0 0 0.55rem; color: #fff; line-height: 1.02; }
.lede { color: rgba(234, 243, 238, 0.82); margin: 0; max-width: 36rem; font-size: 1.02rem; line-height: 1.55; }

.steps { list-style: none; display: flex; align-items: center; gap: 0.7rem; margin: 1.4rem 0 0; padding: 0; }
.steps li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; font-weight: 600; color: rgba(234, 243, 238, 0.5); }
.steps li.on { color: #fff; }
.steps__dot {
  width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; border: 1px solid rgba(255, 255, 255, 0.3); color: rgba(234, 243, 238, 0.7);
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.steps li.on .steps__dot { background: var(--brand-mint); color: #0c3826; border-color: transparent; }
.steps li.done .steps__dot { background: rgba(143, 211, 176, 0.25); color: var(--brand-mint); }
.steps__bar { flex: 0 0 34px; height: 1px; background: rgba(255, 255, 255, 0.25); }

.iq__card {
  background: var(--surface); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: calc(var(--radius) + 6px);
  box-shadow: 0 30px 70px -28px rgba(0, 0, 0, 0.55), 0 6px 18px rgba(0, 0, 0, 0.12);
  padding: 1.9rem; color: var(--text);
}
.iq__foot { text-align: center; color: rgba(234, 243, 238, 0.6); font-size: 0.78rem; margin: 0; letter-spacing: 0.02em; }

.rise { animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--d, 0) * 90ms); }
@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

@media (max-width: 560px) {
  .iq__body { padding: 1rem 1.1rem 2.5rem; justify-content: flex-start; }
  .iq__card { padding: 1.35rem; }
  .steps__bar { flex-basis: 18px; }
}
@media (max-width: 420px) {
  .brand__sub { display: none; }
  .signin { padding: 0.4rem 0.7rem; }
}
@media (prefers-reduced-motion: reduce) {
  .rise, .iq__glows span { animation: none; }
  .rise { opacity: 1; transform: none; }
}
</style>
