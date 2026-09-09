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
});
