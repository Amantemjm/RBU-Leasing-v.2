import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: {
    list: vi.fn(() => Promise.resolve([
      { unitId: "u1", headline: "A", type: "2BR", location: "Tower A", estate: { id: "e1", name: "Capitol" }, details: { unitNumber: "12A" }, coverPhotoId: "p1", photoIds: ["p1"] },
      { unitId: "u2", headline: "B", type: "STUDIO", location: "Tower B", estate: { id: "e2", name: "Ortigas" }, details: { unitNumber: "3C" }, coverPhotoId: "p2", photoIds: ["p2"] },
    ])),
    photoUrl: (id) => `/api/public/units/photo/${id}`,
  },
}));
import AvailableUnitsView from "../src/views/AvailableUnitsView.vue";
import { publicUnits } from "../src/lib/resource.js";
const stubs = { RouterLink: { template: "<a><slot /></a>", props: ["to"] } };

describe("AvailableUnitsView", () => {
  it("renders a card per unit and derives filter options", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.findAllComponents({ name: "UnitCard" }).length).toBe(2);
    // estate + type options derived from the set
    expect(w.text()).toContain("Capitol");
    expect(w.text()).toContain("Ortigas");
  });
  it("re-queries with filter params", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    const typeSelect = w.findAll("select").at(-1); // type filter
    await typeSelect.setValue("2BR");
    await flushPromises();
    expect(publicUnits.list).toHaveBeenLastCalledWith(expect.objectContaining({ type: "2BR" }));
  });
  it("shows an empty state when none", async () => {
    publicUnits.list.mockResolvedValueOnce([]);
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toMatch(/no units/i);
  });
});
