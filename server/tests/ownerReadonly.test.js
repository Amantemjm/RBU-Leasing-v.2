import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("owner read-only leases/payments", () => {
  it("owner sees only leases on their own units", async () => {
    const o1 = await factory.owner();
    const o2 = await factory.owner({ name: "O2" });
    const u1 = await factory.unit(o1.id);
    const u2 = await factory.unit(o2.id, { unitNumber: "202" });
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id);
    await factory.lease(u2.id, t.id);

    const res = await request(app).get("/api/leases").set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("owner cannot create a lease (403)", async () => {
    const o1 = await factory.owner();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.owner(o1.id)}`).send({});
    expect(res.status).toBe(403);
  });
});
