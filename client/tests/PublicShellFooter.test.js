import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PublicShell from "../src/components/PublicShell.vue";

const stubs = {
  RouterLink: { template: "<a :href='to'><slot /></a>", props: ["to"] },
  ThemeToggle: { template: "<button class='themeswitch'></button>" },
};

describe("PublicShell footer prop", () => {
  it("renders the full footer with columns by default", () => {
    const w = mount(PublicShell, { global: { stubs } });
    expect(w.find(".foot").exists()).toBe(true);
    expect(w.find(".foot__grid").exists()).toBe(true);
    expect(w.find(".foot__copy").exists()).toBe(true);
  });

  // External profiles, so they must open in a new tab and carry rel="noopener".
  // The aria-labels are the only text these links have — the icons are decorative.
  it("links the Instagram and Facebook profiles from Get connected", () => {
    const w = mount(PublicShell, { global: { stubs } });
    const links = w.findAll(".foot__social-link");
    expect(links.length).toBe(2);
    const [ig, fb] = links;
    expect(ig.attributes("href")).toBe("https://www.instagram.com/oleasebyortigasland/");
    expect(ig.attributes("aria-label")).toContain("Instagram");
    expect(fb.attributes("href")).toBe("https://www.facebook.com/OLeasebyOrtigasLand");
    expect(fb.attributes("aria-label")).toContain("Facebook");
    for (const a of links) {
      expect(a.attributes("target")).toBe("_blank");
      expect(a.attributes("rel")).toContain("noopener");
      expect(a.find("svg").attributes("aria-hidden")).toBe("true");
    }
  });

  it("renders a slim footer — the copyright line only, no columns", () => {
    const w = mount(PublicShell, { props: { footer: "slim" }, global: { stubs } });
    expect(w.find(".foot").exists()).toBe(true);
    expect(w.find(".foot").classes()).toContain("foot--slim");
    expect(w.find(".foot__grid").exists()).toBe(false);
    expect(w.find(".foot__copy").exists()).toBe(true);
  });

  it("omits the footer entirely with footer=none", () => {
    const w = mount(PublicShell, { props: { footer: "none" }, global: { stubs } });
    expect(w.find(".foot").exists()).toBe(false);
  });

  // The footer appears on every public page, so it cannot presume a role.
  it("points the footer inquiry CTA at the role-neutral inquiry route", () => {
    const w = mount(PublicShell, { global: { stubs } });
    expect(w.find(".foot__cta").attributes("href")).toBe("/inquiry");
  });
});
