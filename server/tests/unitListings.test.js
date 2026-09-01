import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function aUnit(over = {}) {
  const owner = await factory.owner();
  return factory.unit(owner.id, { unitNumber: "12A", building: "Maven", type: "2BR", baseRent: 45000, sizeSqm: 58, ...over });
}
const staff = () => ({ Authorization: `Bearer ${tokens.officer()}` });

describe("Unit listing — get/update", () => {
  it("synthesizes a default listing pre-filled from the unit when none exists", async () => {
    const u = await aUnit();
    const res = await request(app).get(`/api/unit-listings/${u.id}`).set(staff());
    expect(res.status).toBe(200);
    expect(res.body.listing.published).toBe(false);
    expect(res.body.listing.details.unitNumber).toBe("12A");
    expect(res.body.listing.details.rentalRate).toBe(45000);
    expect(Array.isArray(res.body.listing.visibleFields)).toBe(true);
    expect(res.body.photos).toEqual([]);
  });

  it("updates details + visibleFields (upsert) and rejects unknown keys", async () => {
    const u = await aUnit();
    const ok = await request(app).patch(`/api/unit-listings/${u.id}`).set(staff())
      .send({ details: { bedrooms: 2, bathrooms: 1, amenities: ["Pool", "Gym"] }, visibleFields: ["unitNumber", "bedrooms"] });
    expect(ok.status).toBe(200);
    expect(ok.body.listing.details.bedrooms).toBe(2);
    const bad = await request(app).patch(`/api/unit-listings/${u.id}`).set(staff()).send({ details: { sneaky: "x" } });
    expect(bad.status).toBe(400);
    const badVis = await request(app).patch(`/api/unit-listings/${u.id}`).set(staff()).send({ visibleFields: ["nope"] });
    expect(badVis.status).toBe(400);
  });

  it("viewer can GET but not PATCH (403); unknown unit 404", async () => {
    const u = await aUnit();
    const v = await request(app).get(`/api/unit-listings/${u.id}`).set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(v.status).toBe(200);
    const w = await request(app).patch(`/api/unit-listings/${u.id}`).set("Authorization", `Bearer ${tokens.viewer()}`).send({ headline: "x" });
    expect(w.status).toBe(403);
    const nf = await request(app).get(`/api/unit-listings/does-not-exist`).set(staff());
    expect(nf.status).toBe(404);
  });
});
