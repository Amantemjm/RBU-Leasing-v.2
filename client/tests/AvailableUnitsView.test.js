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
const stubs = { RouterLink: { template: "<a :href='to'><slot /></a>", props: ["to"] } };

describe("AvailableUnitsView", () => {
  it("renders a card per unit and derives filter options", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.findAllComponents({ name: "UnitCard" }).length).toBe(2);
    // estate + type options derived from the set
    expect(w.text()).toContain("Capitol");
    expect(w.text()).toContain("Ortigas");
  });
  // The floating switch used to sit on top of "Sign in"; it now lives in the bar.
  it("docks the theme switch inside the header actions", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    const actions = w.find(".nav__actions");
    expect(actions.exists()).toBe(true);
    const sw = actions.find(".themeswitch");
    expect(sw.exists()).toBe(true);
    expect(sw.classes()).toContain("themeswitch--inline");
    expect(sw.attributes("role")).toBe("switch");
  });

  // The header button is gone; the hero's lessor card stays.
  it("drops the List your unit button from the header", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.find(".nav__list").exists()).toBe(false);
    const headerLinks = w.find(".nav__actions").findAll("a").map((a) => a.attributes("href"));
    expect(headerLinks).toEqual(["/login"]);
  });

  it("keeps Sign in as the way through to the portal", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.find(".nav__signin").attributes("href")).toBe("/login");
  });

  it("lays the header out corner to corner", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    // Brand hard left, actions hard right, inside a full-bleed bar.
    const inner = w.find(".nav__inner");
    expect(inner.exists()).toBe(true);
    expect(inner.find(".brand").exists()).toBe(true);
    expect(inner.find(".nav__actions").exists()).toBe(true);
  });

  // Losing sign-in on a phone left portal users with no way in.
  it("keeps Sign in reachable at every width", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    const signin = w.find(".nav__signin");
    expect(signin.exists()).toBe(true);
    expect(signin.attributes("href")).toBe("/login");
  });

  it("offers a skip link and labelled landmarks", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.find(".skip").exists()).toBe(true);
    expect(w.find("#main").exists()).toBe(true);
    expect(w.find("header").attributes("aria-label")).toBeTruthy();
    expect(w.find("footer").attributes("aria-label")).toBeTruthy();
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
  it("shows a 'List your unit' CTA linking to the lessor inquiry", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    const cta = w.findAll("a").find((a) => /list your unit/i.test(a.text()));
    expect(cta).toBeTruthy();
    expect(cta.attributes("href")).toBe("/inquiry?as=LESSOR");
  });
});
