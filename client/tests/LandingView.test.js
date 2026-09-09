import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LandingView from "../src/views/LandingView.vue";

const stubs = { RouterLink: { template: "<a :href='to'><slot /></a>", props: ["to"] } };

describe("LandingView (role selection)", () => {
  it("sends the Lessee to the browse page and the Lessor to Unit Owner signup", () => {
    const w = mount(LandingView, { global: { stubs } });
    const choices = w.findAll(".choice");
    const lessee = choices.find((c) => c.text().includes("Lessee"));
    const lessor = choices.find((c) => c.text().includes("Lessor"));
    // Tie each visible label to its destination so a swap can't pass unnoticed.
    expect(lessee.text()).toContain("Get started");
    expect(lessee.attributes("href")).toBe("/available-units");
    expect(lessor.text()).toContain("List your unit");
    expect(lessor.attributes("href")).toBe("/signup?as=LESSOR");
  });

  it("does not show a Featured Properties section on the landing page", () => {
    const w = mount(LandingView, { global: { stubs } });
    expect(w.find(".featured").exists()).toBe(false);
    expect(w.text()).not.toContain("Featured properties");
  });

  it("shows the cover photo in the split hero", () => {
    const w = mount(LandingView, { global: { stubs } });
    const img = w.find(".hero__media img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBeTruthy();
  });
});
