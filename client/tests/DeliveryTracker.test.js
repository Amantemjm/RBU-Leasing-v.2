import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DeliveryTracker from "../src/components/DeliveryTracker.vue";

describe("DeliveryTracker (parcel-style tracker)", () => {
  it("renders a hero with the tracking number and 10 milestones", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000001", currentStage: "APPROVAL", status: "Under Review" } });
    expect(w.find(".hero__ref").text()).toBe("RBU-2026-000001");
    expect(w.findAll(".ms")).toHaveLength(10);
    // stages before current are done, current is current
    const ms = w.findAll(".ms");
    expect(ms[0].classes()).toContain("done");
    expect(ms[3].classes()).toContain("current");
    expect(ms[4].classes()).toContain("upcoming");
  });

  it("shows a delivered state when the final status is Active", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000002", currentStage: "FINAL_STATUS", status: "Active", finalStatus: "Active" } });
    expect(w.find(".hero__state").text()).toContain("Active");
    expect(w.find(".hero__state").classes()).toContain("delivered");
    // every segment filled
    expect(w.findAll(".bar__seg.on")).toHaveLength(10);
  });

  it("can hide the hero (timeline only)", () => {
    const w = mount(DeliveryTracker, { props: { currentStage: "UNIT_SHOOT", showHero: false } });
    expect(w.find(".hero").exists()).toBe(false);
    expect(w.findAll(".ms")).toHaveLength(10);
  });
});
