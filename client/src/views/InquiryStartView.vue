<script setup>
import { useRouter } from "vue-router";
import InquiryShell from "./InquiryShell.vue";

const router = useRouter();
function select(as) { router.push({ path: "/inquiry", query: { as } }); }
</script>

<template>
  <InquiryShell :step="1" lede="Whether you own a unit to lease out or you're looking for a space, start by telling us who you are.">
    <h2 class="q">I am a…</h2>
    <div class="roles">
      <button type="button" class="role" style="--i:1" @click="select('LESSOR')">
        <span class="role__ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="M9.5 21v-5h5v5"/><path d="M9 11h.01M15 11h.01"/>
          </svg>
        </span>
        <span class="role__head">
          <span class="role__t">Lessor</span>
          <span class="role__meta">Unit Owner</span>
        </span>
        <span class="role__d">You own a unit or property and want to lease it out.</span>
        <span class="role__go">Continue
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>

      <button type="button" class="role" style="--i:2" @click="select('LESSEE')">
        <span class="role__ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8.5" cy="14" r="4"/><path d="M11.5 11.5 20 3M17 6l2.5 2.5M15 8l2 2"/>
          </svg>
        </span>
        <span class="role__head">
          <span class="role__t">Lessee</span>
          <span class="role__meta">Prospective Tenant</span>
        </span>
        <span class="role__d">You're looking to rent or lease a residence or office.</span>
        <span class="role__go">Continue
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
    </div>

    <template #foot>Across Capitol Commons · Circulo Verde · Greenhills Center · Ortigas East</template>
  </InquiryShell>
</template>

<style scoped>
.q { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); font-weight: 700; margin: 0 0 1rem; }
.roles { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.role {
  display: flex; flex-direction: column; gap: 0.55rem; text-align: left; cursor: pointer; position: relative;
  background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius);
  padding: 1.4rem 1.35rem; overflow: hidden;
  transition: transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s ease, border-color 0.18s ease;
  animation: rolein 0.55s cubic-bezier(0.22,1,0.36,1) both; animation-delay: calc(var(--i) * 110ms + 360ms);
}
.role::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--accent);
  transform: scaleX(0); transform-origin: left; transition: transform 0.22s ease;
}
.role:hover, .role:focus-visible { transform: translateY(-4px); box-shadow: 0 16px 34px -18px rgba(12,56,38,0.4); border-color: var(--accent); outline: none; }
.role:hover::before, .role:focus-visible::before { transform: scaleX(1); }
.role__ic {
  width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent-050); color: var(--accent); transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.role:hover .role__ic { background: var(--accent); color: #fff; transform: scale(1.06) rotate(-2deg); }
.role__head { display: flex; align-items: baseline; gap: 0.55rem; flex-wrap: wrap; }
.role__t { font-family: var(--display); font-size: 1.35rem; font-weight: 600; color: var(--ink-800); line-height: 1; }
.role__meta { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; }
.role__d { color: var(--muted); font-size: 0.9rem; line-height: 1.5; flex: 1; }
.role__go { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--accent-text); font-weight: 700; font-size: 0.85rem; margin-top: 0.15rem; }
.role__go svg { transition: transform 0.18s ease; }
.role:hover .role__go svg { transform: translateX(4px); }

@keyframes rolein { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@media (max-width: 560px) { .roles { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) {
  .role { animation: none; }
  .role:hover, .role:focus-visible { transform: none; }
  .role__ic, .role__go svg { transition: none; }
}
</style>
