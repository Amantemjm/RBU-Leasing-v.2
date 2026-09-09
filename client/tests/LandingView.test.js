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

  // Lessors inquire too; the landing sends them to signup, so the inquiry
  // route needs a way in that is not the footer.
  it("offers a quiet inquiry link beneath the two role cards", () => {
    const w = mount(LandingView, { global: { stubs } });
    const link = w.find(".hero__aside a");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("/inquiry");
  });
});
