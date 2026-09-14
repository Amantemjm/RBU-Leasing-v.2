import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ApplicationStatusView from "../src/views/ApplicationStatusView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const get = vi.fn();
const resubmit = vi.fn(() => Promise.resolve({ status: "PENDING" }));
const estates = vi.fn(() => Promise.resolve([{ id: "e1", name: "Capitol Commons" }, { id: "e2", name: "Frontera" }]));
const towers = vi.fn((estateId) =>
  Promise.resolve(estateId === "e1" ? [{ id: "t1", name: "Empress" }] : [{ id: "t2", name: "Verona" }])
);
vi.mock("../src/lib/resource.js", () => ({
  application: { get: (...a) => get(...a), resubmit: (...a) => resubmit(...a) },
  publicRefs: { estates: (...a) => estates(...a), towers: (...a) => towers(...a) },
}));

const stub = { template: "<div/>" };
const stubs = { RouterLink: { template: "<a><slot /></a>" } };

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push("/app/application");
  await router.isReady();
  return { wrapper: mount(ApplicationStatusView, { global: { plugins: [router], stubs } }), router };
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe("Application status page", () => {
  it("shows Pending Review while awaiting a decision", async () => {
    get.mockResolvedValue({ status: "PENDING", pendingUnit: { unitNumber: "19A" }, remarks: null });
    const { wrapper: w } = await mountView();
    await flushPromises();
    expect(w.text()).toContain("Pending Review");
    expect(w.find("form").exists()).toBe(false);
  });

  it("shows the remarks and an editable unit form on For Revision", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "Tower does not match" });
    const { wrapper: w } = await mountView();
    await flushPromises();
    expect(w.text()).toContain("For Revision");
    expect(w.text()).toContain("Tower does not match");
    expect(w.get("#unitNumber").element.value).toBe("19A");
  });

  it("resubmits the corrected unit", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "wrong" });
    const { wrapper: w } = await mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("20B");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).toHaveBeenCalledWith(expect.objectContaining({ unitNumber: "20B" }));
  });

  it("preserves pending unit fields the form edit does not touch on resubmit", async () => {
    get.mockResolvedValue({
      status: "FOR_REVISION",
      pendingUnit: { unitNumber: "19A", slotNo: "B5-15", estateId: "e1", towerId: "t1" },
      remarks: "wrong",
    });
    const { wrapper: w } = await mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("20B");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).toHaveBeenCalledWith(
      expect.objectContaining({ unitNumber: "20B", slotNo: "B5-15", estateId: "e1", towerId: "t1" })
    );
  });

  it("lets the applicant change the estate and tower, and resubmits the new values", async () => {
    get.mockResolvedValue({
      status: "FOR_REVISION",
      pendingUnit: { unitNumber: "19A", estateId: "e1", towerId: "t1" },
      remarks: "Tower does not match",
    });
    const { wrapper: w } = await mountView();
    await flushPromises();
    expect(towers).toHaveBeenCalledWith("e1");
    expect(w.get("#estateId").element.value).toBe("e1");
    expect(w.get("#towerId").element.value).toBe("t1");

    await w.get("#estateId").setValue("e2");
    await flushPromises();
    expect(w.get("#towerId").element.value).toBe("");

    await w.get("#towerId").setValue("t2");
    await w.get("form").trigger("submit");
    await flushPromises();

    expect(resubmit).toHaveBeenCalledWith(expect.objectContaining({ estateId: "e2", towerId: "t2" }));
  });

  it("shows the reason and no form when rejected", async () => {
    get.mockResolvedValue({ status: "REJECTED", pendingUnit: { unitNumber: "19A" }, remarks: "Could not verify identity" });
    const { wrapper: w } = await mountView();
    await flushPromises();
    expect(w.text()).toContain("Rejected");
    expect(w.text()).toContain("Could not verify identity");
    expect(w.find("form").exists()).toBe(false);
  });

  it("refuses to resubmit an empty unit number", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "wrong" });
    const { wrapper: w } = await mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).not.toHaveBeenCalled();
  });

  // The JWT carries status at issue time and nothing refreshes it after an
  // officer approves. Without a way to get a fresh token, the applicant is
  // stuck on this page behind a stale restricted session until it expires.
  describe("Approved — the session must be refreshed", () => {
    it("offers to sign in again rather than leaving the stale session in place", async () => {
      get.mockResolvedValue({ status: "APPROVED", pendingUnit: { unitNumber: "19A" }, remarks: null });
      const { wrapper: w } = await mountView();
      await flushPromises();
      expect(w.text()).toContain("Sign in again");
    });

    it("logs out and routes to /login when that action is taken", async () => {
      get.mockResolvedValue({ status: "APPROVED", pendingUnit: { unitNumber: "19A" }, remarks: null });
      const auth = useAuthStore();
      auth.setSession({ token: "stale-token", user: { id: "u1", role: "UNIT_OWNER", status: "PENDING" } });

      const { wrapper: w, router } = await mountView();
      await flushPromises();
      const btn = w.findAll("button").find((b) => b.text().includes("Sign in again"));
      await btn.trigger("click");
      await flushPromises();

      expect(auth.isAuthenticated).toBe(false);
      expect(router.currentRoute.value.path).toBe("/login");
    });
  });
});
