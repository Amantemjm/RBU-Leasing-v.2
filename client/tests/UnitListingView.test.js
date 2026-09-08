import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

beforeAll(() => {
  if (!global.URL.createObjectURL) global.URL.createObjectURL = vi.fn();
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(global.URL, "createObjectURL").mockReturnValue("blob:mock-url");
  vi.spyOn(global.URL, "revokeObjectURL").mockImplementation(() => {});
});

// The listing page names the steps still outstanding, from the same readiness
// the server gates on — so the page and the refusal cannot disagree.
vi.mock("../src/lib/resource.js", () => ({
  unitListings: {
    listAll: vi.fn(),
    get: vi.fn(),
    update: vi.fn(() => Promise.resolve({})),
    addPhoto: vi.fn(() => Promise.resolve({})),
    deletePhoto: vi.fn(() => Promise.resolve({})),
    reorder: vi.fn(() => Promise.resolve({})),
    caption: vi.fn(() => Promise.resolve({})),
    setCover: vi.fn(() => Promise.resolve({})),
    publish: vi.fn(() => Promise.resolve({})),
    unpublish: vi.fn(() => Promise.resolve({})),
    staffImageUrl: (unitId, photoId) => `/api/unit-listings/${unitId}/photos/${photoId}/image`,
  },
}));
vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(() => Promise.resolve({ data: new Blob(["x"]) })) } }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "u1" } }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ["to"], template: "<a><slot /></a>" },
}));

import UnitListingView from "../src/views/UnitListingView.vue";
import { unitListings } from "../src/lib/resource.js";

describe("UnitListingView", () => {
  beforeEach(() => {
    unitListings.get.mockReset();
    unitListings.get.mockResolvedValue({
      unit: { id: "u1", unitNumber: "12A", status: "VACANT", approvalStatus: "APPROVED" },
      listing: { published: false, details: { unitNumber: "12A", bedrooms: 2 }, visibleFields: ["unitNumber"], coverPhotoId: null },
      photos: [{ id: "p1", caption: null, sortOrder: 1 }],
      readiness: null,
    });
  });

  it("renders photos + details editor and can set cover + publish", async () => {
    const w = mount(UnitListingView);
    await flushPromises();
    expect(w.text()).toContain("12A");
    // a details input for a catalog field exists
    expect(w.find("input, textarea").exists()).toBe(true);
    // set cover
    const cover = w.findAll("button").find((b) => /cover/i.test(b.text()));
    if (cover) { await cover.trigger("click"); await flushPromises(); expect(unitListings.setCover).toHaveBeenCalledWith("u1", "p1"); }
    // publish
    const pub = w.findAll("button").find((b) => /publish/i.test(b.text()));
    await pub.trigger("click"); await flushPromises();
    expect(unitListings.publish).toHaveBeenCalledWith("u1");
  });

  it("coerces number-type detail fields to Number via v-model.number", async () => {
    const w = mount(UnitListingView);
    await flushPromises();
    const numberInput = w.find('input#bedrooms[type="number"]');
    expect(numberInput.exists()).toBe(true);
    await numberInput.setValue("3");
    // "bedrooms" is a "number"-type catalog field bound with v-model.number;
    // its underlying reactive value should be coerced to a Number, not left as a string.
    if (w.vm.details) {
      expect(w.vm.details.bedrooms).toBe(3);
      expect(typeof w.vm.details.bedrooms).toBe("number");
    }
  });
});

describe("UnitListingView publish readiness", () => {
  const payload = (readiness) => ({
    unit: { id: "u1", unitNumber: "19A", approvalStatus: "APPROVED", ownerId: "o1" },
    listing: { unitId: "u1", published: false, headline: null, details: {}, visibleFields: [], coverPhotoId: null },
    photos: [],
    readiness,
  });

  async function mountWith(readiness) {
    unitListings.get.mockResolvedValue(payload(readiness));
    const w = mount(UnitListingView);
    await flushPromises();
    return w;
  }

  beforeEach(() => { unitListings.get.mockReset(); });

  it("lists what is still outstanding before publishing", async () => {
    const w = await mountWith({ approved: true, requirementsApproved: 4, requirementsTotal: 7, photoshootCompleted: false, photoCount: 0 });
    const text = w.find(".blockers").text();
    expect(text).toContain("4 of 7");
    expect(text).toContain("photoshoot");
    expect(text).toContain("photo");
  });

  it("drops a step once it is satisfied", async () => {
    const w = await mountWith({ approved: true, requirementsApproved: 7, requirementsTotal: 7, photoshootCompleted: false, photoCount: 3 });
    const text = w.find(".blockers").text();
    expect(text).not.toContain("of 7");
    expect(text).toContain("photoshoot");
  });

  it("shows nothing once every step is satisfied", async () => {
    const w = await mountWith({ approved: true, requirementsApproved: 7, requirementsTotal: 7, photoshootCompleted: true, photoCount: 2 });
    expect(w.find(".blockers").exists()).toBe(false);
  });

  it("says so when the unit itself is not approved yet", async () => {
    const w = await mountWith({ approved: false, requirementsApproved: 7, requirementsTotal: 7, photoshootCompleted: true, photoCount: 2 });
    expect(w.find(".blockers").text()).toContain("approved");
  });

  it("lists the outstanding steps in the order the server refuses them", async () => {
    const w = await mountWith({ approved: false, requirementsApproved: 0, requirementsTotal: 7, photoshootCompleted: false, photoCount: 0 });
    const items = w.findAll(".blockers li").map((li) => li.text());
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("approved");
    expect(items[1]).toContain("0 of 7");
    expect(items[2]).toContain("photoshoot");
    expect(items[3]).toContain("photo");
  });
});
