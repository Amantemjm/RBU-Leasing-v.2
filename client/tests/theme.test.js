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
