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

// `--brand` is lifted to a mint in dark mode so brand-coloured *text* stays
// legible on dark surfaces. The footer uses the brand as a *fill*, so that lift
// turned it into a bright mint slab with pale text on it. The two roles need
// separate tokens: the footer green is constant across themes.
describe("the footer green is theme-independent", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const SHELL = fs.readFileSync(path.resolve(__dirname, "../src/components/PublicShell.vue"), "utf8");
  const CSS = SHELL.slice(SHELL.indexOf("<style"), SHELL.lastIndexOf("</style>"));

  function declaration(selector, prop) {
    const at = CSS.indexOf(selector + " {");
    if (at === -1) return null;
    const body = CSS.slice(at, CSS.indexOf("}", at));
    const m = body.match(new RegExp(prop + "\s*:\s*([^;]+);"));
    return m ? m[1].trim() : null;
  }

  it("fills the footer from a constant token, not the theme-lifted brand", () => {
    const bg = declaration(".foot", "background");
    expect(bg).toBeTruthy();
    expect(bg).not.toMatch(/var\(--brand\)/);
    expect(bg).toMatch(/var\(--brand-deep\)/);
  });

  it("does not override that token in either dark block", () => {
    const darkBlocks = darkRuleBodies(CSS);
    expect(darkBlocks.length).toBe(2);
    for (const block of darkBlocks) {
      expect(block).not.toMatch(/--brand-deep/);
    }
  });

  it("keeps the on-footer button readable by using the same constant", () => {
    const color = declaration(".foot__col a.foot__cta", "color");
    expect(color).toMatch(/var\(--brand-deep\)/);
  });
});

// Same split as the footer, at the other end of the page: the header is a white
// slab in both themes, so everything sitting on it must be coloured for a light
// ground regardless of theme. `var(--surface)` and `var(--brand)` both flip in
// dark mode, so neither can be used here.
describe("the header stays white", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const SHELL = fs.readFileSync(path.resolve(__dirname, "../src/components/PublicShell.vue"), "utf8");
  const CSS = SHELL.slice(SHELL.indexOf("<style"), SHELL.lastIndexOf("</style>"));

  function ruleBody(selector) {
    const at = CSS.indexOf(selector + " {");
    return at === -1 ? null : CSS.slice(at, CSS.indexOf("}", at));
  }

  it("fills the bar from a constant token", () => {
    const body = ruleBody(".nav");
    expect(body).toBeTruthy();
    expect(body).toMatch(/background:\s*var\(--nav-bg\)/);
    expect(body).not.toMatch(/background:\s*var\(--surface\)/);
  });

  it("never overrides the header tokens in a dark block", () => {
    const darkBlocks = darkRuleBodies(CSS);
    expect(darkBlocks.length).toBe(2);
    for (const block of darkBlocks) {
      const decls = block;
      expect(decls).not.toMatch(/--nav-bg|--nav-line|--nav-muted/);
    }
  });

  it("colours the brand and actions for a light ground", () => {
    expect(ruleBody(".brand__name")).toMatch(/color:\s*var\(--brand-deep\)/);
    expect(ruleBody(".brand__sub")).toMatch(/color:\s*var\(--nav-muted\)/);
    const signin = CSS.slice(CSS.indexOf(".nav__actions :deep(.nav__signin), .nav__signin {"));
    expect(signin.slice(0, signin.indexOf("}"))).toMatch(/color:\s*var\(--brand-deep\)/);
  });
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


  it("keeps the footer green and the header white", () => {
    expect(ruleBody(CSS, ".foot {")).toMatch(/background:\s*var\(--brand-deep\)/);
    expect(ruleBody(CSS, ".nav {")).toMatch(/background:\s*var\(--nav-bg\)/);
  });
});
