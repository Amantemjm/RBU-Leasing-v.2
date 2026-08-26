import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/api.js", () => ({
  api: { post: vi.fn(() => Promise.resolve({ data: { status: "PENDING", user: {} } })) },
}));

import SignupView from "../src/views/SignupView.vue";
import { api } from "../src/lib/api.js";

const stub = { template: "<div/>" };

async function mountSignup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push("/signup");
  await router.isReady();
  return mount(SignupView, { global: { plugins: [router] } });
}

async function fillValid(w, over = {}) {
  const v = { name: "Ana Reyes", username: "ana.reyes", contactEmail: "ana@example.com",
              password: "strong-pass-8", confirm: "strong-pass-8", ...over };
  await w.find("#name").setValue(v.name);
  await w.find("#username").setValue(v.username);
  await w.find("#contactEmail").setValue(v.contactEmail);
  await w.find("#password").setValue(v.password);
  await w.find("#confirm").setValue(v.confirm);
  if (v.consent !== false) await w.find("#consent").setValue(true);
}
const submit = (w) => w.find("form").trigger("submit.prevent");

describe("SignupView", () => {
  beforeEach(() => {
    api.post.mockClear();
    api.post.mockResolvedValue({ data: { status: "PENDING", user: {} } });
  });

  it("submits an application with a separate contact email and consent", async () => {
    const w = await mountSignup();
    await fillValid(w);
    await submit(w);
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith("/auth/signup", {
      name: "Ana Reyes", email: "ana.reyes", contactEmail: "ana@example.com",
      password: "strong-pass-8", role: "TENANT", consent: true,
    });
  });

  // The account cannot be used yet, so it must not pretend to sign anyone in.
  it("confirms the application is awaiting approval instead of redirecting", async () => {
    const w = await mountSignup();
    await fillValid(w);
    await submit(w);
    await flushPromises();
    expect(w.text()).toContain("Application received");
    expect(w.text()).toContain("approve it shortly");
    expect(w.find("form").exists()).toBe(false);
  });

  // There is no password reset in this system: a typo here locks them out.
  it("refuses mismatched passwords with a field-level message", async () => {
    const w = await mountSignup();
    await fillValid(w, { confirm: "different-pass" });
    await submit(w);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain("Passwords do not match.");
  });

  it("requires 8+ characters, not 6", async () => {
    const w = await mountSignup();
    await fillValid(w, { password: "short7!", confirm: "short7!" });
    await submit(w);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain("at least 8 characters");
  });

  it("requires a valid email address", async () => {
    const w = await mountSignup();
    await fillValid(w, { contactEmail: "not-an-email" });
    await submit(w);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain("valid email address");
  });

  it("requires consent", async () => {
    const w = await mountSignup();
    await fillValid(w, { consent: false });
    await submit(w);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain("Please agree before continuing.");
  });

  it("names each bad field rather than lumping them together", async () => {
    const w = await mountSignup();
    await submit(w);
    await flushPromises();
    const errs = w.findAll(".fld__err").map((e) => e.text());
    expect(errs.length).toBeGreaterThanOrEqual(4);
    expect(errs.some((e) => e.includes("full name"))).toBe(true);
    expect(errs.some((e) => e.includes("Username"))).toBe(true);
  });

  it("can reveal each password field independently", async () => {
    const w = await mountSignup();
    const eyes = w.findAll(".pw-toggle");
    expect(eyes).toHaveLength(2);
    expect(w.find("#password").attributes("type")).toBe("password");
    await eyes[0].trigger("click");
    expect(w.find("#password").attributes("type")).toBe("text");
    expect(w.find("#confirm").attributes("type")).toBe("password");
  });

  it("rates password strength as it is typed", async () => {
    const w = await mountSignup();
    await w.find("#password").setValue("abcdefgh");
    expect(w.find(".strength").text()).toContain("Weak");
    await w.find("#password").setValue("Str0ng-Passw0rd!");
    expect(w.find(".strength").text()).toContain("Strong");
  });

  it("shows the server's message when signup is refused", async () => {
    api.post.mockRejectedValue({ response: { data: { error: "An account with that username or email already exists" } } });
    const w = await mountSignup();
    await fillValid(w);
    await submit(w);
    await flushPromises();
    expect(w.text()).toContain("already exists");
  });
});
