import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Owners CRUD", () => {
  it("officer creates; viewer lists and gets", async () => {
    const created = await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "Ayala Land", email: "owner@example.com" });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list = await request(app).get("/api/owners")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const got = await request(app).get(`/api/owners/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(got.status).toBe(200);
    expect(got.body.name).toBe("Ayala Land");
  });

  it("officer updates an owner", async () => {
    const owner = await factory.owner({ name: "Old" });
    const res = await request(app).patch(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "New" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("viewer cannot create (403)", async () => {
    const res = await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid input (400)", async () => {
    const res = await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("404 for a missing owner", async () => {
    const res = await request(app).get("/api/owners/does-not-exist")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(404);
  });

  it("deletes an owner with no units (204)", async () => {
    const owner = await factory.owner();
    const res = await request(app).delete(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(204);
  });

  it("blocks delete when owner has units (409)", async () => {
    const owner = await factory.owner();
    await factory.unit(owner.id);
    const res = await request(app).delete(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
