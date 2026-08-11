import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/resource.js", () => ({
  createUser: vi.fn(() => Promise.resolve({ email: "frontdesk", role: "VIEWER" })),
}));

import UsersView from "../src/views/UsersView.vue";
import { createUser } from "../src/lib/resource.js";

describe("UsersView", () => {
  beforeEach(() => { createUser.mockClear(); });
  it("creates a plain login with no owner/tenant link", async () => {
    const w = mount(UsersView);
    await flushPromises();
    expect(w.find("#unitOwnerId").exists()).toBe(false);
    expect(w.find("#tenantId").exists()).toBe(false);
    await w.find("#name").setValue("Front Desk");
    await w.find("#email").setValue("frontdesk");
    await w.find("#password").setValue("pw123456");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createUser).toHaveBeenCalledWith({
      name: "Front Desk", email: "frontdesk", password: "pw123456", role: "VIEWER",
    });
  });
});
