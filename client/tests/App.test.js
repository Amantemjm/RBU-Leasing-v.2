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

  // On public routes there is no nav bar, so App.vue renders the floating
  // ThemeToggle itself, mounted once at the root so it sits in the identical
  // viewport position on every public route.
  it.each(["/", "/login", "/signup", "/inquiry"])(
    "renders the floating theme toggle on %s",
    async (path) => {
      const router = makeRouter();
      router.push(path);
      await router.isReady();
      const w = mount(App, { global: { plugins: [router] } });
      expect(w.findComponent(ThemeToggle).exists()).toBe(true);
    },
  );

  // Inside the app shell (/app/*) the switch lives in the nav bar (AppLayout)
  // instead, so App.vue must not also render the floating control — otherwise
  // there would be two toggles on screen.
  it("does not render the floating theme toggle on /app/* routes", async () => {
    const router = makeRouter();
    router.push("/app/users");
    await router.isReady();
    const w = mount(App, { global: { plugins: [router] } });
    expect(w.findComponent(ThemeToggle).exists()).toBe(false);
  });
});
