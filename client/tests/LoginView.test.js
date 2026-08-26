import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/api.js", () => ({
  api: { post: vi.fn(() => Promise.resolve({ data: { token: "t", user: { name: "A", role: "ADMIN" } } })) },
}));

import LoginView from "../src/views/LoginView.vue";

const stub = { template: "<div/>" };

async function mountLogin() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push("/login");
  await router.isReady();
  return mount(LoginView, { global: { plugins: [router] } });
}

const pwInput = (w) => w.find("#password");
const toggle = (w) => w.find(".pw-toggle");

describe("LoginView — password visibility", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("masks the password by default", async () => {
    const w = await mountLogin();
    expect(pwInput(w).attributes("type")).toBe("password");
  });

  it("offers a control to reveal it", async () => {
    const w = await mountLogin();
    expect(toggle(w).exists()).toBe(true);
    expect(toggle(w).attributes("type")).toBe("button"); // must not submit the form
  });

  it("reveals and re-masks on click", async () => {
    const w = await mountLogin();
    await toggle(w).trigger("click");
    expect(pwInput(w).attributes("type")).toBe("text");
    await toggle(w).trigger("click");
    expect(pwInput(w).attributes("type")).toBe("password");
  });

  it("keeps what was typed when toggling", async () => {
    const w = await mountLogin();
    await pwInput(w).setValue("Ortigas-Capitol-53#");
    await toggle(w).trigger("click");
    expect(pwInput(w).element.value).toBe("Ortigas-Capitol-53#");
  });

  it("announces its state to screen readers", async () => {
    const w = await mountLogin();
    expect(toggle(w).attributes("aria-label")).toBe("Show password");
    expect(toggle(w).attributes("aria-pressed")).toBe("false");
    await toggle(w).trigger("click");
    expect(toggle(w).attributes("aria-label")).toBe("Hide password");
    expect(toggle(w).attributes("aria-pressed")).toBe("true");
  });

  it("still submits the credentials normally while revealed", async () => {
    const { api } = await import("../src/lib/api.js");
    api.post.mockClear();
    const w = await mountLogin();
    await w.find("#username").setValue("admin@rbu.local");
    await pwInput(w).setValue("secret123");
    await toggle(w).trigger("click");
    await w.find("form").trigger("submit.prevent");
    expect(api.post).toHaveBeenCalledWith("/auth/login", { email: "admin@rbu.local", password: "secret123" });
  });
});
