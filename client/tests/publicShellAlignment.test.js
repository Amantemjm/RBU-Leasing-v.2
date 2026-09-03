import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

// The public pages had drifted into two unrelated designs: the front page was a
// real site layout (sticky header, themed body, footer), while login, signup and
// the two inquiry steps were each a standalone deep-green void with a floating
// card — unthemed, with no header or footer. They now all wear the same shell.

vi.mock("../src/lib/api.js", () => ({
  api: { post: vi.fn(() => Promise.resolve({ data: { token: "t", user: { name: "A", role: "ADMIN" } } })) },
}));
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: {
    list: vi.fn(() => Promise.resolve([])),
    get: vi.fn(() => Promise.resolve({ unitId: "u1", headline: "A", details: {}, photoIds: [] })),
    photoUrl: (id) => `/api/public/units/photo/${id}`,
  },
}));
vi.mock("../src/lib/inquiries.js", () => ({
  submitInquiry: vi.fn(() => Promise.resolve({ id: "i1" })),
  CATEGORIES: [],
  INQUIRY_TYPES: {},
}));

import AvailableUnitsView from "../src/views/AvailableUnitsView.vue";
import LoginView from "../src/views/LoginView.vue";
import SignupView from "../src/views/SignupView.vue";
import InquiryStartView from "../src/views/InquiryStartView.vue";
import InquiryView from "../src/views/InquiryView.vue";
import UnitDetailPublicView from "../src/views/UnitDetailPublicView.vue";

const stub = { template: "<div/>" };

// The two `.portal` dark rule bodies. Matching on the bare selector text is not
// safe: the stylesheet mentions those selectors inside explanatory comments, and
// a naive split lands mid-comment and scans the wrong region. Comments are
// stripped from the body too: these tests assert on declarations, and the
// rules explain in prose which tokens they deliberately leave alone.
function darkRuleBodies(css) {
  const out = [];
  const re = /:root(?:\[data-theme="dark"\]|:not\(\[data-theme="light"\]\))[^{;*]*\.portal\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 0;
    for (let i = m.index + m[0].length - 1; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) { out.push(css.slice(m.index + m[0].length, i).replace(/\/\*[\s\S]*?\*\//g, "")); break; }
    }
  }
  return out;
}

async function mountPage(Component, path = "/") {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push(path);
  await router.isReady();
  const w = mount(Component, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

const PAGES = [
  ["front page", AvailableUnitsView, "/"],
  ["login", LoginView, "/login"],
  ["signup", SignupView, "/signup"],
  ["inquiry step 1", InquiryStartView, "/inquire"],
  ["inquiry step 2", InquiryView, "/inquiry?as=LESSEE"],
  ["public unit detail", UnitDetailPublicView, "/units-for-lease/u1"],
];

describe("public pages share the front page's shell", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const [name, Component, path] of PAGES) {
    describe(name, () => {
      it("renders the site header with the brand lockup", async () => {
        const w = await mountPage(Component, path);
        const header = w.find("header.nav");
        expect(header.exists()).toBe(true);
        expect(header.attributes("aria-label")).toBeTruthy();
        expect(header.find(".brand__name").text()).toBe("Ortigas Land");
        // One lockup everywhere: login used to say "Residential Business Unit".
        expect(header.find(".brand__sub").text().toLowerCase()).toBe("leasing portal");
      });

      it("docks the theme switch in the header actions", async () => {
        const w = await mountPage(Component, path);
        const sw = w.find(".nav__actions .themeswitch");
        expect(sw.exists()).toBe(true);
        expect(sw.classes()).toContain("themeswitch--inline");
        expect(sw.attributes("role")).toBe("switch");
      });

      it("renders the site footer", async () => {
        const w = await mountPage(Component, path);
        const foot = w.find("footer.foot");
        expect(foot.exists()).toBe(true);
        expect(foot.attributes("aria-label")).toBeTruthy();
      });

      it("offers a skip link to the main content", async () => {
        const w = await mountPage(Component, path);
        expect(w.find(".skip").exists()).toBe(true);
        expect(w.find("#main").exists()).toBe(true);
      });

      // The tell-tale of the old design was a full-viewport green canvas as the
      // page root, which is why these pages ignored the theme entirely. The
      // root must now be the shared shell. (`.auth` survives as an inner
      // wrapper for the form styling — it is the canvas that had to go.)
      it("is rooted in the shared shell, not a standalone canvas", async () => {
        const w = await mountPage(Component, path);
        expect(w.element.classList.contains("portal")).toBe(true);
        expect(w.element.classList.contains("iq")).toBe(false);
        expect(w.element.classList.contains("auth")).toBe(false);
      });
    });
  }
});
// The public pages do not follow the theme: they are a fixed white-and-green
// brand surface, with the footer the only green slab. That only holds if every
// token the global dark block flips is re-pinned on `.portal` — anything missed
// leaks the app's dark value into the public pages the moment dark is on. This
// reads both files so a token added to the dark palette later fails here rather
// than silently darkening a public page.
describe("public pages do not follow the theme", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const APP = fs.readFileSync(path.resolve(__dirname, "../src/styles/app.css"), "utf8");
  const SHELL = fs.readFileSync(path.resolve(__dirname, "../src/components/PublicShell.vue"), "utf8");
  const CSS = SHELL.slice(SHELL.indexOf("<style"), SHELL.lastIndexOf("</style>"));

  function ruleBody(css, selector) {
    const at = css.indexOf(selector);
    if (at === -1) return null;
    const open = css.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
    }
    return null;
  }
  const names = (b) => (b.match(/--[\w-]+\s*:/g) || []).map((d) => d.replace(":", "").trim());

  const darkTokens = names(ruleBody(APP, ':root[data-theme="dark"],'));
  const portalTokens = names(ruleBody(CSS, ".portal {"));
  it("re-pins every token that the app's dark palette overrides", () => {
    expect(darkTokens.length).toBeGreaterThan(15);
    const leaking = darkTokens.filter((t) => !portalTokens.includes(t));
    expect(leaking).toEqual([]);
  });

  // Toggling the switch turns the public pages green: white page -> green page,
  // with the white header and green footer framing both. The green palette is a
  // real override on top of the pinned light one.
  it("turns the page green when dark is on", () => {
    const explicit = ruleBody(CSS, ':root[data-theme="dark"] .portal');
    expect(explicit).toBeTruthy();
    expect(explicit).toMatch(/--paper:/);
    expect(explicit).toMatch(/--surface:/);
    // Cards sit lighter than the page, as green-on-green needs separation.
    const val = (b, t) => (b.match(new RegExp("--" + t + ":\s*([^;]+);")) || [])[1];
    const chan = (hex) => parseInt(hex.trim().slice(1, 3), 16) + parseInt(hex.trim().slice(3, 5), 16);
    expect(chan(val(explicit, "surface"))).toBeGreaterThan(chan(val(explicit, "paper")));
  });

  it("declares an identical green palette in both dark blocks", () => {
    const decls = (b) => (b.match(/--[\w-]+\s*:[^;]+;/g) || []).map((d) => d.replace(/\s+/g, " ").trim()).sort();
    const explicit = ruleBody(CSS, ':root[data-theme="dark"] .portal');
    const os = ruleBody(CSS, ':root:not([data-theme="light"]) .portal');
    expect(os).toBeTruthy();
    expect(decls(os)).toEqual(decls(explicit));
    expect(decls(explicit).length).toBeGreaterThan(10);
  });


});

// Navigation is #183D3D in both modes, by design: against the light page it is
// a strong dark bar; against the #040D12 dark page it is an elevated surface,
// where depth comes from the border and shadow rather than from contrast.
// This supersedes the earlier "header stays white / footer stays green /
// chrome contrasts with the body" rules, which the premium brief replaced.
describe("navigation is the same teal in both modes", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const SHELL = fs.readFileSync(path.resolve(__dirname, "../src/components/PublicShell.vue"), "utf8");
  const CSS = SHELL.slice(SHELL.indexOf("<style"), SHELL.lastIndexOf("</style>"));

  function block(css, selector) {
    const at = css.indexOf(selector);
    if (at === -1) return null;
    const open = css.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
    }
    return null;
  }
  function tok(b, name) {
    const key = "--" + name + ":";
    const at = b.indexOf(key);
    return at === -1 ? null : b.slice(at + key.length, b.indexOf(";", at)).trim();
  }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (rgb) =>
    rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m);
    return (hi + 0.05) / (lo + 0.05);
  };

  const light = block(CSS, ".portal {");
  const dark = block(CSS, ':root[data-theme="dark"] .portal');

  it("uses one navigation colour across both modes", () => {
    expect(tok(light, "chrome-bg").toUpperCase()).toBe("#183D3D");
    expect(tok(dark, "chrome-bg").toUpperCase()).toBe("#183D3D");
  });

  it("reads as a dark bar against the light page", () => {
    expect(ratio(tok(light, "chrome-bg"), tok(light, "paper"))).toBeGreaterThan(4.5);
    expect(lum(hex(tok(light, "chrome-bg")))).toBeLessThan(lum(hex(tok(light, "paper"))));
  });

  it("sits above the dark page as an elevated surface", () => {
    expect(lum(hex(tok(dark, "chrome-bg")))).toBeGreaterThan(lum(hex(tok(dark, "paper"))));
  });

  it("keeps the bar's own contents legible in both modes", () => {
    for (const [name, b] of [["light", light], ["dark", dark]]) {
      for (const t of ["chrome-text", "chrome-muted", "chrome-faint", "chrome-accent"]) {
        expect(ratio(tok(b, t), tok(b, "chrome-bg")), name + " " + t).toBeGreaterThan(4.5);
      }
    }
  });
});

// Each mode is designed, not inverted: the light theme layers white cards on an
// off-white page, the dark theme layers #183D3D-tinted surfaces on #040D12.
describe("both modes have a real surface ladder", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const APP = fs.readFileSync(path.resolve(__dirname, "../src/styles/app.css"), "utf8");
  function block(css, selector) {
    const at = css.indexOf(selector);
    const open = css.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
    }
    return null;
  }
  function tok(b, name) {
    const key = "--" + name + ":";
    const at = b.indexOf(key);
    return at === -1 ? null : b.slice(at + key.length, b.indexOf(";", at)).trim();
  }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (rgb) =>
    rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);

  it("gives each mode three distinct surface levels", () => {
    for (const [name, sel] of [["light", ":root {"], ["dark", ':root[data-theme="dark"],']]) {
      const b = block(APP, sel);
      const levels = ["paper", "surface", "surface-2"].map((t) => tok(b, t));
      expect(new Set(levels).size, name + " distinct levels").toBe(3);
    }
  });

  it("builds the dark mode up from the deep ground, not down from white", () => {
    const b = block(APP, ':root[data-theme="dark"],');
    expect(tok(b, "paper").toUpperCase()).toBe("#040D12");
    expect(lum(hex(tok(b, "surface")))).toBeGreaterThan(lum(hex(tok(b, "paper"))));
  });

  it("keeps the light mode off-white rather than pure white", () => {
    const b = block(APP, ":root {");
    expect(tok(b, "paper").toUpperCase()).not.toBe("#FFFFFF");
    expect(tok(b, "surface").toUpperCase()).toBe("#FFFFFF");
  });
});
