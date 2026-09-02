import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("../src/stores/auth.js", () => ({ useAuthStore: () => ({ role: "ADMIN" }) }));
import ContentManagerView from "../src/views/ContentManagerView.vue";

const stubs = { RouterLink: { template: "<a :href='to'><slot /></a>", props: ["to"] } };

describe("ContentManagerView", () => {
  it("renders section cards, Listings linking to the listings manager", () => {
    const w = mount(ContentManagerView, { global: { stubs } });
    expect(w.text()).toContain("Content Manager");
    const listings = w.findAll("a").find((a) => a.text().includes("Listings"));
    expect(listings).toBeTruthy();
    expect(listings.attributes("href")).toBe("/app/content/listings");
    // admin also sees the Forms section
    expect(w.text()).toContain("Forms");
  });
});
