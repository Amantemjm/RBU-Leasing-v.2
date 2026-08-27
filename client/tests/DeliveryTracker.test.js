import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DeliveryTracker from "../src/components/DeliveryTracker.vue";

describe("DeliveryTracker (parcel-style tracker)", () => {
  it("renders a hero with the tracking number and 6 milestones", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000001", currentStage: "APPROVAL", status: "Under Review" } });
    expect(w.find(".hero__ref").text()).toBe("RBU-2026-000001");
    expect(w.findAll(".ms")).toHaveLength(6);
    const ms = w.findAll(".ms");
    expect(ms[0].classes()).toContain("done");     // Inquiry
    expect(ms[2].classes()).toContain("current");  // Approval (index 2)
    expect(ms[3].classes()).toContain("upcoming"); // Unit Inspection
  });

  it("shows a delivered state when the Photoshoot is Completed", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000002", currentStage: "PHOTOSHOOT", status: "Completed", finalStatus: "Completed" } });
    expect(w.find(".hero__state").text()).toContain("Completed");
    expect(w.find(".hero__state").classes()).toContain("delivered");
    expect(w.findAll(".bar__seg.on")).toHaveLength(6);
  });

  it("can hide the hero (timeline only)", () => {
    const w = mount(DeliveryTracker, { props: { currentStage: "KEY_TURNOVER", showHero: false } });
    expect(w.find(".hero").exists()).toBe(false);
    expect(w.findAll(".ms")).toHaveLength(6);
  });
});
