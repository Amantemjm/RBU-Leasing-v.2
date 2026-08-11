import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/resource.js", () => ({
  owners: { list: vi.fn(() => Promise.resolve([{ id: "o1", name: "Ayala" }])) },
  tenants: { list: vi.fn(() => Promise.resolve([{ id: "t1", name: "Juan" }])) },
  createUser: vi.fn(() => Promise.resolve({ email: "owner1@x.com", role: "UNIT_OWNER" })),
}));

import UsersView from "../src/views/UsersView.vue";
import { createUser } from "../src/lib/resource.js";

describe("UsersView", () => {
  beforeEach(() => { createUser.mockClear(); });
  it("shows the owner picker for UNIT_OWNER and creates a linked login", async () => {
    const w = mount(UsersView);
    await flushPromises();
    expect(w.find("#unitOwnerId").exists()).toBe(true); // default role is UNIT_OWNER
    await w.find("#name").setValue("Owner One");
    await w.find("#email").setValue("owner1@x.com");
    await w.find("#password").setValue("pw123456");
    await w.find("#unitOwnerId").setValue("o1");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ role: "UNIT_OWNER", unitOwnerId: "o1" }));
  });
});
