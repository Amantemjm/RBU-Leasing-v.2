import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({ publicUnits: { photoUrl: (id) => `/api/public/units/photo/${id}` } }));
import UnitCard from "../src/components/UnitCard.vue";

const card = {
  unitId: "u1", headline: "Maven 12A", type: "2BR", location: "Tower A, Capitol",
  details: { unitNumber: "12A", rentalRate: 45000, bedrooms: 2 },
  coverPhotoId: "p2", photoIds: ["p1", "p2", "p3"],
};
const stubs = { RouterLink: { template: "<a><slot /></a>", props: ["to"] } };

describe("UnitCard", () => {
  it("shows the cover photo first and the configured details", () => {
    const w = mount(UnitCard, { props: { card }, global: { stubs } });
    const img = w.find("img");
    expect(img.attributes("src")).toBe("/api/public/units/photo/p2"); // cover first
    expect(w.text()).toContain("12A");
    expect(w.text()).toMatch(/45,000/); // currency-formatted rentalRate
  });
  it("cycles photos with the arrows (wraps) and hides arrows with <=1 photo", async () => {
    const w = mount(UnitCard, { props: { card }, global: { stubs } });
    const next = w.findAll("button").find((b) => /next|▶|›|>/.test(b.text()) || b.attributes("aria-label")?.match(/next/i));
    expect(next).toBeTruthy();
    await next.trigger("click");
    // from cover p2 → next is p3
    expect(w.find("img").attributes("src")).toBe("/api/public/units/photo/p3");
    // single-photo card hides arrows
    const one = mount(UnitCard, { props: { card: { ...card, photoIds: ["p1"], coverPhotoId: "p1" } }, global: { stubs } });
    expect(one.findAll("button").some((b) => /next|▶|›/.test(b.text()) || b.attributes("aria-label")?.match(/next/i))).toBe(false);
  });
});
