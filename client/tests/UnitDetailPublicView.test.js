import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "u1" } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: {
    get: vi.fn(() => Promise.resolve({
      unitId: "u1", headline: "Maven 12A", location: "Tower A",
      details: { unitNumber: "12A", rentalRate: 45000, amenities: ["Pool", "Gym"] },
      photos: [{ id: "p1", caption: "Living" }, { id: "p2", caption: null }], photoIds: ["p1", "p2"], coverPhotoId: "p1",
    })),
    photoUrl: (id) => `/api/public/units/photo/${id}`,
  },
}));
import UnitDetailPublicView from "../src/views/UnitDetailPublicView.vue";
import { publicUnits } from "../src/lib/resource.js";

describe("UnitDetailPublicView", () => {
  it("renders all details and a carousel", async () => {
    const w = mount(UnitDetailPublicView);
    await flushPromises();
    expect(w.text()).toContain("12A");
    expect(w.text()).toMatch(/45,000/);
    expect(w.text()).toContain("Pool, Gym");
    expect(w.find("img").attributes("src")).toBe("/api/public/units/photo/p1");
    const next = w.findAll("button").find((b) => b.attributes("aria-label")?.match(/next/i) || /▶|›|next/i.test(b.text()));
    await next.trigger("click");
    expect(w.find("img").attributes("src")).toBe("/api/public/units/photo/p2");
  });
  it("shows a not-available message on 404", async () => {
    publicUnits.get.mockRejectedValueOnce({ response: { status: 404 } });
    const w = mount(UnitDetailPublicView);
    await flushPromises();
    expect(w.text()).toMatch(/no longer available|not available|not found/i);
  });
});
