import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/resource.js", () => ({
  listUsers: vi.fn(() => Promise.resolve([
    { id: "u1", name: "Admin", email: "admin@rbu.local", role: "ADMIN", createdAt: "2026-08-01T00:00:00Z" },
  ])),
  createUser: vi.fn(() => Promise.resolve({ email: "frontdesk", role: "VIEWER" })),
}));

import UsersView from "../src/views/UsersView.vue";
import { createUser, listUsers } from "../src/lib/resource.js";

describe("UsersView", () => {
  beforeEach(() => { createUser.mockClear(); listUsers.mockClear(); });

  it("lists existing credentials", async () => {
    const w = mount(UsersView);
    await flushPromises();
    expect(listUsers).toHaveBeenCalled();
    expect(w.text()).toContain("admin@rbu.local");
    expect(w.find("#email").exists()).toBe(false); // form hidden until "New account"
  });

  it("opens the modal and creates a plain login", async () => {
    const w = mount(UsersView);
    await flushPromises();
    const newBtn = w.findAll("button").find((b) => b.text() === "New account");
    await newBtn.trigger("click");
    expect(w.find("#unitOwnerId").exists()).toBe(false);
    await w.find("#name").setValue("Front Desk");
    await w.find("#email").setValue("frontdesk");
    await w.find("#password").setValue("pw123456");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createUser).toHaveBeenCalledWith({
      name: "Front Desk", email: "frontdesk", password: "pw123456", role: "VIEWER",
    });
    expect(listUsers).toHaveBeenCalledTimes(2); // reloaded after create
  });
});
