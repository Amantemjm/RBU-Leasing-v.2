import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function setup() {
  const owner = await factory.owner();
  const e1 = await factory.estate({ name: "Capitol Commons" });
  const e2 = await factory.estate({ name: "Circulo Verde" });
  const t1 = await factory.tower(e1.id, { name: "The Royalton at Capitol Commons" });
  const t2 = await factory.tower(e2.id, { name: "Ibiza Tower" });
  await factory.unit(owner.id, { unitNumber: "R-1", towerId: t1.id });
  await factory.unit(owner.id, { unitNumber: "R-2", towerId: t1.id });
  await factory.unit(owner.id, { unitNumber: "I-1", towerId: t2.id });
  return { owner, e1, e2, t1, t2 };
}

describe("Unit hierarchy filtering", () => {
  it("filters units by estateId", async () => {
    const { e1 } = await setup();
    const res = await request(app).get(`/api/units?estateId=${e1.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("filters units by towerId", async () => {
    const { t2 } = await setup();
    const res = await request(app).get(`/api/units?towerId=${t2.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitNumber).toBe("I-1");
  });

  it("includes tower + estate on each unit", async () => {
    const { t1 } = await setup();
    const res = await request(app).get(`/api/units?towerId=${t1.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.body[0].tower.name).toBe("The Royalton at Capitol Commons");
    expect(res.body[0].tower.estate.name).toBe("Capitol Commons");
  });

  it("creates a unit with a valid towerId", async () => {
    const { owner, t1 } = await setup();
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ ownerId: owner.id, unitNumber: "NEW-1", baseRent: 30000, towerId: t1.id });
    expect(res.status).toBe(201);
    expect(res.body.towerId).toBe(t1.id);
  });

  it("rejects a unit with an invalid towerId (400)", async () => {
    const { owner } = await setup();
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ ownerId: owner.id, unitNumber: "BAD-1", baseRent: 30000, towerId: "ghost" });
    expect(res.status).toBe(400);
  });
});
