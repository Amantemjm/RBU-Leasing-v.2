import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OnboardingProgress from "../src/components/OnboardingProgress.vue";

describe("OnboardingProgress", () => {
  it("renders the five onboarding steps in order", () => {
    const w = mount(OnboardingProgress, { props: { current: "unit" } });
    const labels = w.findAll("[data-step]").map((n) => n.attributes("data-step"));
    expect(labels).toEqual(["unit", "account", "review", "requirements", "verification"]);
  });

  it("marks the current step", () => {
    const w = mount(OnboardingProgress, { props: { current: "review" } });
    expect(w.get('[data-step="review"]').attributes("aria-current")).toBe("step");
  });

  it("marks steps before the current one as done", () => {
    const w = mount(OnboardingProgress, { props: { current: "review" } });
    expect(w.get('[data-step="unit"]').classes()).toContain("is-done");
    expect(w.get('[data-step="requirements"]').classes()).not.toContain("is-done");
  });

  it("shows a status on the step that carries one", () => {
    const w = mount(OnboardingProgress, {
      props: { current: "review", statuses: { review: "For Revision" } },
    });
    expect(w.get('[data-step="review"]').text()).toContain("For Revision");
  });

  it("renders without statuses", () => {
    const w = mount(OnboardingProgress, { props: { current: "unit" } });
    expect(w.text()).toContain("Your unit");
  });
});
