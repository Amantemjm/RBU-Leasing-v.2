import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LandingView from "../src/views/LandingView.vue";

const stubs = { RouterLink: { template: "<a :href='to'><slot /></a>", props: ["to"] } };

describe("LandingView (role selection)", () => {
  it("offers the two role choices with the correct destinations", () => {
    const w = mount(LandingView, { global: { stubs } });
    const hrefs = w.findAll(".choice").map((c) => c.attributes("href"));
    expect(hrefs).toContain("/available-units");
    expect(hrefs).toContain("/signup?as=LESSOR");
  });

  it("does not show a Featured Properties section on the landing page", () => {
    const w = mount(LandingView, { global: { stubs } });
    expect(w.find(".featured").exists()).toBe(false);
    expect(w.text()).not.toContain("Featured properties");
  });
});
