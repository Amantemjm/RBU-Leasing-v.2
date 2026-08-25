import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ThemeToggle from "../src/components/ThemeToggle.vue";
import { useTheme } from "../src/lib/theme.js";

function sw(w) {
  return w.find(".themeswitch");
}

describe("ThemeToggle", () => {
  // theme.js keeps one shared module-level ref, and the component imported it
  // when this file loaded — so reset through its own API rather than trying to
  // re-initialise the module, which a static import would ignore anyway.
  beforeEach(() => {
    localStorage.clear();
    useTheme().setTheme("light");
  });

  it("is a single switch, not a set of options", () => {
    const w = mount(ThemeToggle);
    expect(w.findAll("button")).toHaveLength(1);
    expect(sw(w).attributes("role")).toBe("switch");
  });

  it("labels itself so the control is understandable without sight", () => {
    const w = mount(ThemeToggle);
    expect(sw(w).attributes("aria-label")).toBe("Dark mode");
    expect(sw(w).attributes("title")).toBeTruthy();
  });

  // aria-checked on role="switch" is what a screen reader announces as on/off.
  it("reports off while light and on while dark", async () => {
    const w = mount(ThemeToggle);
    expect(sw(w).attributes("aria-checked")).toBe("false");
    await sw(w).trigger("click");
    expect(sw(w).attributes("aria-checked")).toBe("true");
  });

  it("switches the document to dark and back", async () => {
    const w = mount(ThemeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    await sw(w).trigger("click");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await sw(w).trigger("click");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists the choice", async () => {
    const w = mount(ThemeToggle);
    await sw(w).trigger("click");
    expect(localStorage.getItem("rbu-theme")).toBe("dark");
  });

  it("moves the knob to reflect the state", async () => {
    const w = mount(ThemeToggle);
    expect(sw(w).classes()).not.toContain("is-dark");
    await sw(w).trigger("click");
    expect(sw(w).classes()).toContain("is-dark");
  });

  it("never offers a system option", () => {
    const w = mount(ThemeToggle);
    expect(w.text().toLowerCase()).not.toContain("system");
  });
});
