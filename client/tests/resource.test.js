import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/api.js", () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: [{ id: "1" }] })),
    post: vi.fn(() => Promise.resolve({ data: { id: "2" } })),
    patch: vi.fn(() => Promise.resolve({ data: { id: "3" } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import { api } from "../src/lib/api.js";
import { resource } from "../src/lib/resource.js";

describe("resource factory", () => {
  it("list() GETs the path with params and returns data", async () => {
    const r = resource("/owners");
    const data = await r.list({ ownerId: "x" });
    expect(api.get).toHaveBeenCalledWith("/owners", { params: { ownerId: "x" } });
    expect(data).toEqual([{ id: "1" }]);
  });
  it("get() GETs path/:id", async () => {
    await resource("/owners").get("abc");
    expect(api.get).toHaveBeenCalledWith("/owners/abc");
  });
  it("create() POSTs the path", async () => {
    await resource("/owners").create({ name: "A" });
    expect(api.post).toHaveBeenCalledWith("/owners", { name: "A" });
  });
  it("update() PATCHes path/:id", async () => {
    await resource("/units").update("u1", { baseRent: 1 });
    expect(api.patch).toHaveBeenCalledWith("/units/u1", { baseRent: 1 });
  });
  it("remove() DELETEs path/:id", async () => {
    await resource("/units").remove("u1");
    expect(api.delete).toHaveBeenCalledWith("/units/u1");
  });
});
