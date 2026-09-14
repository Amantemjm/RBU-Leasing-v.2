import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RegisterUnitPublicView from "../src/views/RegisterUnitPublicView.vue";

vi.mock("../src/lib/api.js", () => ({ api: { post: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock("../src/lib/resource.js", () => ({
  publicRefs: { estates: vi.fn(() => Promise.resolve([{ id: "e1", name: "Capitol Commons" }])),
                towers: vi.fn(() => Promise.resolve([{ id: "t1", name: "Empress" }])) },
}));

const stubs = { PublicShell: { template: "<div><slot /></div>" }, RouterLink: { template: "<a><slot /></a>" } };
const mountView = () => mount(RegisterUnitPublicView, { global: { stubs } });

beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });

describe("Public registration wizard", () => {
  it("opens on the unit step, not the account step", () => {
    const w = mountView();
    expect(w.find("#unitNumber").exists()).toBe(true);
    expect(w.find("#password").exists()).toBe(false);
  });

  it("will not advance without a unit number", async () => {
    const w = mountView();
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("Unit number is required");
    expect(w.find("#password").exists()).toBe(false);
  });

  it("advances to the account step once a unit number is given", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.find("#password").exists()).toBe(true);
  });

  it("restores the unit step from sessionStorage after a remount", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    w.unmount();

    const again = mountView();
    await flushPromises();
    await again.find("#unitNumber").setValue("");
    expect(sessionStorage.getItem("rbu.lessorApplication")).toContain("19A");
  });

  it("restores the tower list when a saved draft already has an estate", async () => {
    sessionStorage.setItem(
      "rbu.lessorApplication",
      JSON.stringify({ unit: { estateId: "e1", towerId: "t1", unitNumber: "19A" } })
    );
    const { publicRefs } = await import("../src/lib/resource.js");
    const w = mountView();
    await flushPromises();
    expect(publicRefs.towers).toHaveBeenCalledWith("e1");
    expect(w.get("#towerId").element.value).toBe("t1");
  });

  it("submits the unit and the account in one request", async () => {
    const { api } = await import("../src/lib/api.js");
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();

    await w.find("#name").setValue("Jane Lessor");
    await w.find("#username").setValue("janelessor");
    await w.find("#contactEmail").setValue("jane@x.com");
    await w.find("#password").setValue("secret12345");
    await w.find("#confirm").setValue("secret12345");
    await w.find("#consent").setValue(true);
    await w.find("form").trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe("/auth/signup");
    expect(payload.role).toBe("UNIT_OWNER");
    expect(payload.unit.unitNumber).toBe("19A");
    expect(payload.name).toBe("Jane Lessor");
  });

  it("clears the saved draft after a successful submit", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    await w.find("#name").setValue("Jane Lessor");
    await w.find("#username").setValue("janelessor");
    await w.find("#contactEmail").setValue("jane@x.com");
    await w.find("#password").setValue("secret12345");
    await w.find("#confirm").setValue("secret12345");
    await w.find("#consent").setValue(true);
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(sessionStorage.getItem("rbu.lessorApplication")).toBeNull();
  });

  it("never writes the password to sessionStorage", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    await w.find("#password").setValue("secret12345");
    expect(sessionStorage.getItem("rbu.lessorApplication")).not.toContain("secret12345");
  });

  // This branch inverted the flow specifically so the applicant CAN sign in
  // before approval — the confirmation screen must not say the opposite, and
  // must not promise contact the system never sends.
  it("tells the applicant they can sign in to check status, and promises no contact", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    await w.find("#name").setValue("Jane Lessor");
    await w.find("#username").setValue("janelessor");
    await w.find("#contactEmail").setValue("jane@x.com");
    await w.find("#password").setValue("secret12345");
    await w.find("#confirm").setValue("secret12345");
    await w.find("#consent").setValue(true);
    await w.find("form").trigger("submit");
    await flushPromises();

    expect(w.text()).not.toContain("You will not be able to sign in");
    expect(w.text()).not.toContain("We will reach you");
    const link = w.findAll("a").find((a) => a.text() === "Check your application status");
    expect(link).toBeTruthy();
  });
});
