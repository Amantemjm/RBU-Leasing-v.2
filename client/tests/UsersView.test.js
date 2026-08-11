import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/resource.js", () => ({
  listUsers: vi.fn(() => Promise.resolve([
    { id: "u1", name: "Super Admin", email: "admin@rbu.local", role: "ADMIN", createdAt: "2026-08-01T00:00:00Z" },
    { id: "u2", name: "Front Desk", email: "frontdesk", role: "VIEWER", createdAt: "2026-08-02T00:00:00Z" },
  ])),
  createUser: vi.fn(() => Promise.resolve({ email: "frontdesk", role: "VIEWER" })),
  updateUser: vi.fn(() => Promise.resolve({})),
  deleteUser: vi.fn(() => Promise.resolve()),
}));

import UsersView from "../src/views/UsersView.vue";
import { createUser, listUsers, updateUser, deleteUser } from "../src/lib/resource.js";

function findBtn(w, label) {
  return w.findAll("button").find((b) => b.text() === label);
}

describe("UsersView", () => {
  beforeEach(() => { createUser.mockClear(); listUsers.mockClear(); updateUser.mockClear(); deleteUser.mockClear(); });

  it("lists existing credentials with a Super admin tag", async () => {
    const w = mount(UsersView);
    await flushPromises();
    expect(listUsers).toHaveBeenCalled();
    expect(w.text()).toContain("admin@rbu.local");
    expect(w.text()).toContain("Super admin");
    expect(w.find("#email").exists()).toBe(false); // form hidden until "New account"
  });

  it("opens the modal and creates a plain login", async () => {
    const w = mount(UsersView);
    await flushPromises();
    await findBtn(w, "New account").trigger("click");
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

  it("edits a login (blank password is omitted)", async () => {
    const w = mount(UsersView);
    await flushPromises();
    // second row (frontdesk) Edit button
    const editButtons = w.findAll("button").filter((b) => b.text() === "Edit");
    await editButtons[1].trigger("click");
    await w.find("#name").setValue("Reception");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(updateUser).toHaveBeenCalledWith("u2", { name: "Reception", email: "frontdesk", role: "VIEWER" });
  });

  it("deletes a login after confirmation", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const w = mount(UsersView);
    await flushPromises();
    const delButtons = w.findAll("button").filter((b) => b.text() === "Delete");
    await delButtons[1].trigger("click"); // frontdesk (super admin's is disabled)
    await flushPromises();
    expect(deleteUser).toHaveBeenCalledWith("u2");
    vi.unstubAllGlobals();
  });

  it("disables Delete for the super admin", async () => {
    const w = mount(UsersView);
    await flushPromises();
    const delButtons = w.findAll("button").filter((b) => b.text() === "Delete");
    expect(delButtons[0].attributes("disabled")).toBeDefined(); // admin row
    expect(delButtons[1].attributes("disabled")).toBeUndefined(); // frontdesk row
  });
});
