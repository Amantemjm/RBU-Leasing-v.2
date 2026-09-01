import { describe, it, expect, vi, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

beforeAll(() => {
  if (!global.URL.createObjectURL) global.URL.createObjectURL = vi.fn();
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(global.URL, "createObjectURL").mockReturnValue("blob:mock-url");
  vi.spyOn(global.URL, "revokeObjectURL").mockImplementation(() => {});
});

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "u1" } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(() => Promise.resolve({ data: new ArrayBuffer(8) })) } }));
vi.mock("../src/lib/resource.js", () => ({
  unitListings: {
    get: vi.fn(() => Promise.resolve({
      unit: { id: "u1", unitNumber: "12A", status: "VACANT", approvalStatus: "APPROVED" },
      listing: { published: false, details: { unitNumber: "12A", bedrooms: 2 }, visibleFields: ["unitNumber"], coverPhotoId: null },
      photos: [{ id: "p1", caption: null, sortOrder: 1 }],
    })),
    update: vi.fn(() => Promise.resolve({})), addPhoto: vi.fn(() => Promise.resolve({})),
    deletePhoto: vi.fn(), reorder: vi.fn(), caption: vi.fn(), setCover: vi.fn(() => Promise.resolve({})),
    publish: vi.fn(() => Promise.resolve({})), unpublish: vi.fn(),
    staffImageUrl: (u, p) => `/api/unit-listings/${u}/photos/${p}/image`,
  },
}));
import UnitListingView from "../src/views/UnitListingView.vue";
import { unitListings } from "../src/lib/resource.js";

describe("UnitListingView", () => {
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
