import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The lessee can see what is available without leaving the portal — the same
// published listings as the public gallery, filterable, each opening the unit's
// own page. Read-only: enquiring is a separate conversation.
const UNITS = [
  { unitId: "u1", headline: "A", type: "1 Bedroom", location: "Ibiza Tower", estate: { id: "e1", name: "Circulo Verde" }, details: { unitNumber: "19A" }, coverPhotoId: "p1", photoIds: ["p1"] },
  { unitId: "u2", headline: "B", type: "Studio", location: "Royalton", estate: { id: "e2", name: "Capitol Commons" }, details: { unitNumber: "5I" }, coverPhotoId: "p2", photoIds: ["p2"] },
  { unitId: "u3", headline: "C", type: "1 Bedroom", location: "Royalton", estate: { id: "e2", name: "Capitol Commons" }, details: { unitNumber: "12E" }, coverPhotoId: null, photoIds: [] },
];

vi.mock("../src/lib/resource.js", () => ({
  publicUnits: {
    list: vi.fn(() => Promise.resolve(UNITS)),
    photoUrl: (id) => `/api/public/units/photo/${id}`,
  },
}));

vi.mock("vue-router", () => ({
  RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}));

import BrowseUnitsView from "../src/views/BrowseUnitsView.vue";
import { publicUnits } from "../src/lib/resource.js";

async function mountView() {
  const w = mount(BrowseUnitsView);
  await flushPromises();
  return w;
}

describe("BrowseUnitsView (lessee portal)", () => {
  beforeEach(() => {
    publicUnits.list.mockClear();
    publicUnits.list.mockResolvedValue(UNITS);
  });

  it("shows every published unit", async () => {
    const w = await mountView();
    expect(w.findAllComponents({ name: "UnitCard" })).toHaveLength(3);
  });

  it("says how many are available", async () => {
    const w = await mountView();
    expect(w.text()).toContain("3 units available");
  });

  it("derives its filters from the listings", async () => {
    const w = await mountView();
    const estates = w.find("select[aria-label='Filter by estate']").findAll("option").map((o) => o.text());
    const types = w.find("select[aria-label='Filter by unit type']").findAll("option").map((o) => o.text());
    expect(estates).toContain("Circulo Verde");
    expect(estates).toContain("Capitol Commons");
    expect(types).toContain("1 Bedroom");
    expect(types).toContain("Studio");
  });

  it("narrows the list by estate", async () => {
    const w = await mountView();
    await w.find("select[aria-label='Filter by estate']").setValue("e2");
    await flushPromises();
    expect(w.findAllComponents({ name: "UnitCard" })).toHaveLength(2);
  });

  it("narrows the list by unit type", async () => {
    const w = await mountView();
    await w.find("select[aria-label='Filter by unit type']").setValue("Studio");
    await flushPromises();
    expect(w.findAllComponents({ name: "UnitCard" })).toHaveLength(1);
  });

  it("can clear the filters again", async () => {
    const w = await mountView();
    await w.find("select[aria-label='Filter by unit type']").setValue("Studio");
    await flushPromises();
    await w.find(".filters__clear").trigger("click");
    await flushPromises();
    expect(w.findAllComponents({ name: "UnitCard" })).toHaveLength(3);
  });

  it("says so plainly when nothing is published yet", async () => {
    publicUnits.list.mockResolvedValue([]);
    const w = await mountView();
    expect(w.text()).toContain("No units are available");
  });

  it("does not fail the page when the listing call errors", async () => {
    publicUnits.list.mockRejectedValue(new Error("network"));
    const w = await mountView();
    expect(w.find(".error-line").exists()).toBe(true);
  });
});
