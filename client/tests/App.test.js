import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import App from "../src/App.vue";
import ThemeToggle from "../src/components/ThemeToggle.vue";

const stub = { template: "<div class='page'/>" };

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: stub },
      { path: "/login", component: stub },
      { path: "/signup", component: stub },
      { path: "/inquiry", component: stub },
      { path: "/app/users", component: stub },
    ],
  });
}

describe("App shell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  // Mounted once at the root rather than per-layout, so the control sits in the
  // identical viewport position on every route — public pages included.
  it.each(["/", "/login", "/signup", "/inquiry", "/app/users"])(
    "renders the theme toggle on %s",
    async (path) => {
      const router = makeRouter();
      router.push(path);
      await router.isReady();
      const w = mount(App, { global: { plugins: [router] } });
      expect(w.findComponent(ThemeToggle).exists()).toBe(true);
    },
  );

  it("renders exactly one theme toggle, never a duplicate", async () => {
    const router = makeRouter();
    router.push("/app/users");
    await router.isReady();
    const w = mount(App, { global: { plugins: [router] } });
    expect(w.findAllComponents(ThemeToggle)).toHaveLength(1);
  });
});
