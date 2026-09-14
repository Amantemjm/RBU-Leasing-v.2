<script setup>
// Presentational only: renders ONBOARDING_STEPS against a current step key
// and optional per-step status labels. Holds no state, fetches nothing,
// decides nothing — used by the registration wizard, the application status
// page, and the lessor's portal.
import { computed } from "vue";
import { ONBOARDING_STEPS, ONBOARDING_STEP_KEYS } from "../../../shared/onboardingSteps.js";

const props = defineProps({
  current: { type: String, required: true },
  statuses: { type: Object, default: () => ({}) },
});

const currentIndex = computed(() => ONBOARDING_STEP_KEYS.indexOf(props.current));
const steps = computed(() =>
  ONBOARDING_STEPS.map((s, i) => ({
    ...s,
    done: i < currentIndex.value,
    isCurrent: i === currentIndex.value,
    status: props.statuses[s.key] || null,
  })),
);
</script>

<template>
  <ol class="prog" aria-label="Application progress">
    <li
      v-for="(s, i) in steps" :key="s.key"
      :data-step="s.key"
      class="prog__step"
      :class="{ 'is-done': s.done, 'is-current': s.isCurrent }"
      :aria-current="s.isCurrent ? 'step' : undefined"
    >
      <span class="prog__n" aria-hidden="true">{{ s.done ? "✓" : i + 1 }}</span>
      <span class="prog__body">
        <span class="prog__l">{{ s.label }}</span>
        <span v-if="s.status" class="prog__s">{{ s.status }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.prog {
  list-style: none;
  display: flex;
  align-items: flex-start;
  margin: 0;
  padding: 0;
}

.prog__step {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.4rem;
  padding: 0 0.25rem;
}

/* Connecting rail between step numbers, skipping past the first step. */
.prog__step:not(:first-child)::before {
  content: "";
  position: absolute;
  top: 14px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: var(--line);
  z-index: 0;
}
.prog__step.is-done::before {
  background: var(--good);
}

.prog__n {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--surface);
  border: 2px solid var(--line);
  color: var(--muted);
}
.prog__step.is-done .prog__n {
  background: var(--good);
  border-color: var(--good);
  color: #fff;
}
.prog__step.is-current .prog__n {
  border-color: var(--accent-text);
  color: var(--accent-text);
}

.prog__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.prog__l {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
}
.prog__step.is-done .prog__l,
.prog__step.is-current .prog__l {
  color: var(--accent-text);
}

.prog__s {
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  background: var(--surface);
  color: var(--muted);
}

@media (max-width: 620px) {
  .prog {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .prog__step {
    flex-direction: row;
    align-items: center;
    text-align: left;
    padding: 0;
  }
  .prog__step:not(:first-child)::before {
    top: 0;
    left: 13px;
    right: auto;
    bottom: -0.75rem;
    width: 2px;
    height: 0.75rem;
  }
  .prog__body {
    align-items: flex-start;
    margin-left: 0.65rem;
  }
}
</style>
