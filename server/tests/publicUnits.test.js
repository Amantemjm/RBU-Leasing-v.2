import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5c0000000049454e44ae426082", "hex");
const staff = () => ({ Authorization: `Bearer ${tokens.officer()}` });

async function publishedUnit(over = {}, estateName = "PublicEstate") {
  const owner = await factory.owner();
  const estate = await factory.estate({ name: estateName });
  const tower = await factory.tower(estate.id, { name: "T1" });
  const u = await factory.unit(owner.id, { unitNumber: "9A", type: "2BR", baseRent: 40000, towerId: tower.id, status: "VACANT", approvalStatus: "APPROVED", ...over });
  const p = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
  await request(app).patch(`/api/unit-listings/${u.id}`).set(staff()).send({ visibleFields: ["unitNumber", "unitType", "rentalRate"], details: { unitNumber: "9A", unitType: "2BR", rentalRate: 40000, bedrooms: 2 } });
  await request(app).patch(`/api/unit-listings/${u.id}/publish`).set(staff());
  return { u, estate, tower, photoId: p.body.id };
}

describe("Public units", () => {
  it("lists only published+vacant+approved and carries only visibleFields (no bytes)", async () => {
    const { u } = await publishedUnit();
    // an unpublished unit
    const owner = await factory.owner(); await factory.unit(owner.id, { baseRent: 1, status: "VACANT", approvalStatus: "APPROVED" });
    const res = await request(app).get("/api/public/units");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitId).toBe(u.id);
    expect(res.body[0].details.unitNumber).toBe("9A");
    expect(res.body[0].details.bedrooms).toBeUndefined(); // not in visibleFields
    expect(res.body[0].photoIds.length).toBe(1);
    expect(JSON.stringify(res.body[0])).not.toContain("data");
  });
  it("hides an OCCUPIED unit", async () => {
    const { u } = await publishedUnit();
    await prisma.unit.update({ where: { id: u.id }, data: { status: "OCCUPIED" } });
    const res = await request(app).get("/api/public/units");
    expect(res.body).toHaveLength(0);
  });
  it("filters by estate and type", async () => {
    const a = await publishedUnit();
    const res = await request(app).get(`/api/public/units?estateId=${a.estate.id}&type=2BR`);
    expect(res.body).toHaveLength(1);
    const none = await request(app).get(`/api/public/units?type=STUDIO`);
    expect(none.body).toHaveLength(0);
  });
  it("serves a published photo but 404s an unpublished unit's photo and detail", async () => {
    const { photoId } = await publishedUnit();
    const img = await request(app).get(`/api/public/units/photo/${photoId}`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toContain("image/png");
    // unpublished
    const owner = await factory.owner(); const u2 = await factory.unit(owner.id, { baseRent: 1, status: "VACANT", approvalStatus: "APPROVED" });
    const p2 = await request(app).post(`/api/unit-listings/${u2.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const hidden = await request(app).get(`/api/public/units/photo/${p2.body.id}`);
    expect(hidden.status).toBe(404);
    const hiddenDetail = await request(app).get(`/api/public/units/${u2.id}`);
    expect(hiddenDetail.status).toBe(404);
  });
});
