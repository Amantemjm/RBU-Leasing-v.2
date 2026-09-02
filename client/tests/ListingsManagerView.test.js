import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("../src/lib/resource.js", () => ({
  unitListings: {
    listAll: vi.fn(() => Promise.resolve([
      { unitId: "u1", unitNumber: "12A", propertyName: "Maven", location: "Capitol", approvalStatus: "APPROVED", status: "VACANT", published: false, photoCount: 3, updatedAt: "2026-08-01T00:00:00.000Z" },
      { unitId: "u2", unitNumber: "3C", propertyName: "Estancia", location: "Ortigas", approvalStatus: "DRAFT", status: "VACANT", published: false, photoCount: 0, updatedAt: "2026-08-02T00:00:00.000Z" },
    ])),
    publish: vi.fn(() => Promise.resolve({})),
    unpublish: vi.fn(() => Promise.resolve({})),
  },
}));
import ListingsManagerView from "../src/views/ListingsManagerView.vue";
import { unitListings } from "../src/lib/resource.js";

describe("ListingsManagerView", () => {
  it("renders a row per unit with status", async () => {
    const w = mount(ListingsManagerView);
    await flushPromises();
    expect(w.text()).toContain("Maven");
    expect(w.text()).toContain("Unit 12A");
    expect(w.text()).toContain("Draft");
  });
  it("Manage routes to the per-unit editor", async () => {
    const w = mount(ListingsManagerView);
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "Manage").trigger("click");
    expect(push).toHaveBeenCalledWith("/app/units/u1/listing");
  });
  it("Publish is enabled for an approved unit with photos and calls publish", async () => {
    const w = mount(ListingsManagerView);
    await flushPromises();
    const pub = w.findAll("button").find((b) => b.text() === "Publish" && !b.attributes("disabled"));
    expect(pub).toBeTruthy();
    await pub.trigger("click");
    await flushPromises();
    expect(unitListings.publish).toHaveBeenCalledWith("u1");
  });
  it("Publish is disabled for a draft unit with no photos", async () => {
    const w = mount(ListingsManagerView);
    await flushPromises();
    // u2 (DRAFT, 0 photos) → its Publish button is disabled
    const buttons = w.findAll("button").filter((b) => b.text() === "Publish");
    expect(buttons.some((b) => b.attributes("disabled") !== undefined)).toBe(true);
  });
});
