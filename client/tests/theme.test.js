import { describe, it, expect, beforeEach, vi } from "vitest";

const KEY = "rbu-theme";

// The module holds the current choice at module scope, so each test needs a
// fresh copy — otherwise a choice made in one test leaks into the next.
async function freshTheme() {
  vi.resetModules();
  return import("../src/lib/theme.js");
}

function attr() {
  return document.documentElement.getAttribute("data-theme");
}

// happy-dom's matchMedia reports no match by default; stub it so tests can say
// what the OS prefers.
function stubOS(prefersDark) {
  vi.stubGlobal("matchMedia", (q) => ({
    matches: q.includes("dark") ? prefersDark : !prefersDark,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.unstubAllGlobals();
  });

  it("is only ever light or dark", async () => {
    const { CHOICES } = await freshTheme();
    expect(CHOICES).toEqual(["light", "dark"]);
  });

  // No "system" mode any more, so first-run has to start somewhere sensible:
  // whatever the OS already prefers.
  it("starts from the OS preference when nothing is stored", async () => {
    stubOS(true);
    const dark = await freshTheme();
    expect(dark.useTheme().theme.value).toBe("dark");
    expect(attr()).toBe("dark");

    document.documentElement.removeAttribute("data-theme");
    stubOS(false);
    const light = await freshTheme();
    expect(light.useTheme().theme.value).toBe("light");
    expect(attr()).toBe("light");
  });

  it("prefers a stored choice over the OS", async () => {
    stubOS(true);
    localStorage.setItem(KEY, "light");
    const { useTheme } = await freshTheme();
    expect(useTheme().theme.value).toBe("light");
    expect(attr()).toBe("light");
  });

  it("toggles between the two themes", async () => {
    stubOS(false);
    const { useTheme } = await freshTheme();
    const { theme, toggleTheme } = useTheme();

    expect(theme.value).toBe("light");
    toggleTheme();
    expect(theme.value).toBe("dark");
    expect(attr()).toBe("dark");
    toggleTheme();
    expect(theme.value).toBe("light");
    expect(attr()).toBe("light");
  });

  it("persists a toggle and restores it on the next load", async () => {
    stubOS(false);
    const first = await freshTheme();
    first.useTheme().toggleTheme();
    expect(localStorage.getItem(KEY)).toBe("dark");

    document.documentElement.removeAttribute("data-theme");
    const second = await freshTheme();
    expect(second.useTheme().theme.value).toBe("dark");
    expect(attr()).toBe("dark");
  });

  it("can be set explicitly", async () => {
    const { useTheme } = await freshTheme();
    const { setTheme, theme } = useTheme();
    setTheme("dark");
    expect(theme.value).toBe("dark");
    expect(attr()).toBe("dark");
  });

  it("ignores a junk stored value and falls back to the OS", async () => {
    stubOS(true);
    localStorage.setItem(KEY, "chartreuse");
    const { useTheme } = await freshTheme();
    expect(useTheme().theme.value).toBe("dark");
  });

  it("refuses an invalid theme rather than stamping it", async () => {
    stubOS(false);
    const { useTheme } = await freshTheme();
    const { setTheme, theme } = useTheme();
    setTheme("system"); // the mode that no longer exists
    expect(theme.value).toBe("light");
    expect(attr()).toBe("light");
  });

  it("survives localStorage throwing (private mode / disabled storage)", async () => {
    stubOS(false);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const { useTheme } = await freshTheme();
    expect(() => useTheme().toggleTheme()).not.toThrow();
    expect(attr()).toBe("dark"); // still applies for this session
    setItem.mockRestore();
  });

  it("shares one reactive value across callers", async () => {
    const { useTheme } = await freshTheme();
    const a = useTheme();
    const b = useTheme();
    a.setTheme("dark");
    expect(b.theme.value).toBe("dark");
  });
});

// A theme switch repaints the whole window. Fading only part of it left the
// header and footer in the new theme while the page between them was still in
// the old one — a visible tear for the length of the fade. The cross-fade is now
// the browser's: one snapshot of the old page dissolving into the new, so no
// element is ever out of step with its neighbour.
describe("theme cross-fade", () => {
  // stubOS above ties reduced-motion to the inverse of the dark preference, so
  // these tests need a stub that answers the two queries independently.
  function stubMedia({ dark = false, reduce = false } = {}) {
    vi.stubGlobal("matchMedia", (q) => ({
      matches: q.includes("reduced-motion") ? reduce : dark,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
  }

  // Chrome runs the callback synchronously and hands back the transition.
  function stubViewTransitions({ finished = Promise.resolve() } = {}) {
    const calls = [];
    document.startViewTransition = (cb) => {
      calls.push(cb);
      cb();
      return { finished, ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    };
    return calls;
  }

  // A rejected promise that records whether the code under test attached a
  // handler. The safety catch keeps the test process itself clean.
  function trackedRejection(label, seen) {
    const p = Promise.reject(new Error(label));
    p.catch(() => {});
    const original = p.catch.bind(p);
    p.catch = (fn) => {
      seen.push(label);
      return original(fn);
    };
    return p;
  }

  // A sibling of the describe above, so it does not inherit that block's reset —
  // it needs its own, or a stored choice leaks in and inverts the toggle.
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
    vi.unstubAllGlobals();
    delete document.startViewTransition;
  });

  it("cross-fades the whole page through a view transition", async () => {
    stubMedia();
    const calls = stubViewTransitions();
    const { useTheme } = await freshTheme();
    useTheme().toggleTheme();
    expect(calls).toHaveLength(1);
    expect(attr()).toBe("dark"); // applied inside the transition callback
  });

  it("applies the theme instantly when the browser has no view transitions", async () => {
    stubMedia();
    expect(document.startViewTransition).toBeUndefined();
    const { useTheme } = await freshTheme();
    expect(() => useTheme().toggleTheme()).not.toThrow();
    expect(attr()).toBe("dark");
  });

  it("skips the cross-fade when the user prefers reduced motion", async () => {
    stubMedia({ reduce: true });
    const calls = stubViewTransitions();
    const { useTheme } = await freshTheme();
    useTheme().toggleTheme();
    expect(calls).toHaveLength(0);
    expect(attr()).toBe("dark"); // still switches, just without the fade
  });

  it("does not start a transition when the theme is unchanged", async () => {
    stubMedia();
    const calls = stubViewTransitions();
    const { useTheme } = await freshTheme();
    useTheme().setTheme("light"); // already light
    expect(calls).toHaveLength(0);
  });

  // A fast double-toggle aborts the in-flight transition. Chrome rejects every
  // one of the transition's promises when that happens — not just `finished` —
  // so all three need a handler or the console fills with InvalidStateError.
  it("survives a transition that is aborted mid-flight", async () => {
    stubMedia();
    const seen = [];
    document.startViewTransition = (cb) => {
      cb();
      return {
        finished: trackedRejection("finished", seen),
        ready: trackedRejection("ready", seen),
        updateCallbackDone: trackedRejection("updateCallbackDone", seen),
      };
    };
    const { useTheme } = await freshTheme();
    expect(() => useTheme().toggleTheme()).not.toThrow();
    expect(attr()).toBe("dark"); // the theme still applies
    expect(seen.sort()).toEqual(["finished", "ready", "updateCallbackDone"]);
    await new Promise((r) => setTimeout(r, 0));
  });

  // Older Chrome hands back a transition without `updateCallbackDone`.
  it("tolerates a transition object missing some promises", async () => {
    stubMedia();
    document.startViewTransition = (cb) => {
      cb();
      return { finished: Promise.resolve() };
    };
    const { useTheme } = await freshTheme();
    expect(() => useTheme().toggleTheme()).not.toThrow();
    expect(attr()).toBe("dark");
  });

  it("no longer drives the fade with a theme-anim class", async () => {
    stubMedia();
    stubViewTransitions();
    const { useTheme } = await freshTheme();
    useTheme().toggleTheme();
    expect(document.documentElement.classList.contains("theme-anim")).toBe(false);
  });
});
