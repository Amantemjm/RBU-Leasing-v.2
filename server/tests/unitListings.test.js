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

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5c0000000049454e44ae426082", "hex");

describe("Unit listing — photos", () => {
  async function withPhoto() {
    const owner = await factory.owner();
    const u = await factory.unit(owner.id, { unitNumber: "5C", baseRent: 30000 });
    const up = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff())
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    return { u, photoId: up.body.id, up };
  }

  it("uploads a photo with incrementing sortOrder + createdByName", async () => {
    const { u, up } = await withPhoto();
    expect(up.status).toBe(201);
    expect(up.body.sortOrder).toBe(1);
    expect(up.body).toHaveProperty("createdByName");
    const up2 = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "b.png", contentType: "image/png" });
    expect(up2.body.sortOrder).toBe(2);
    // no bytes in the metadata payload
    expect(up.body.data).toBeUndefined();
  });

  it("rejects a non-image upload (400)", async () => {
    const owner = await factory.owner(); const u = await factory.unit(owner.id, { baseRent: 1 });
    const res = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff())
      .attach("file", Buffer.from("not an image"), { filename: "x.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("serves the staff image bytes", async () => {
    const { u, photoId } = await withPhoto();
    const img = await request(app).get(`/api/unit-listings/${u.id}/photos/${photoId}/image`).set(staff());
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toContain("image/png");
  });

  it("reorders, captions, sets cover, and deletes (foreign photo 404)", async () => {
    const { u, photoId } = await withPhoto();
    const p2 = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "b.png", contentType: "image/png" });
    const reo = await request(app).patch(`/api/unit-listings/${u.id}/photos/reorder`).set(staff()).send({ orderedIds: [p2.body.id, photoId] });
    expect(reo.status).toBe(200);
    expect(reo.body.photos[0].id).toBe(p2.body.id);
    const cap = await request(app).patch(`/api/unit-listings/${u.id}/photos/${photoId}`).set(staff()).send({ caption: "Living room" });
    expect(cap.body.photos.find((p) => p.id === photoId).caption).toBe("Living room");
    const cov = await request(app).patch(`/api/unit-listings/${u.id}/cover`).set(staff()).send({ photoId });
    expect(cov.status).toBe(200);
    expect(cov.body.listing.coverPhotoId).toBe(photoId);
    // foreign photo id 404
    const other = await factory.owner().then((o) => factory.unit(o.id, { baseRent: 1 }));
    const bad = await request(app).delete(`/api/unit-listings/${other.id}/photos/${photoId}`).set(staff());
    expect(bad.status).toBe(404);
    // delete the cover clears coverPhotoId
    const del = await request(app).delete(`/api/unit-listings/${u.id}/photos/${photoId}`).set(staff());
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/unit-listings/${u.id}`).set(staff());
    expect(after.body.listing.coverPhotoId).toBeNull();
  });

  it("setCover on a fresh unit still pre-fills listing details from the unit", async () => {
    const owner = await factory.owner();
    const u = await factory.unit(owner.id, { unitNumber: "7Z", building: "Maven", type: "2BR", baseRent: 22000, sizeSqm: 40 });
    const up = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff())
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const cov = await request(app).patch(`/api/unit-listings/${u.id}/cover`).set(staff()).send({ photoId: up.body.id });
    expect(cov.status).toBe(200);
    const res = await request(app).get(`/api/unit-listings/${u.id}`).set(staff());
    expect(res.body.listing.details.unitNumber).toBe("7Z");
    expect(res.body.listing.details.rentalRate).toBe(22000);
  });
});

describe("Unit listing — publish", () => {
  it("blocks publish with no photos (409) and when unit not APPROVED (409)", async () => {
    const owner = await factory.owner();
    const u = await factory.unit(owner.id, { baseRent: 1, approvalStatus: "APPROVED" });
    const noPhoto = await request(app).patch(`/api/unit-listings/${u.id}/publish`).set(staff());
    expect(noPhoto.status).toBe(409);
    await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const u2 = await factory.unit(owner.id, { baseRent: 1, approvalStatus: "DRAFT" });
    await request(app).post(`/api/unit-listings/${u2.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const notApproved = await request(app).patch(`/api/unit-listings/${u2.id}/publish`).set(staff());
    expect(notApproved.status).toBe(409);
    const ok = await request(app).patch(`/api/unit-listings/${u.id}/publish`).set(staff());
    expect(ok.status).toBe(200);
    expect(ok.body.listing.published).toBe(true);
    expect(ok.body.listing.publishedAt).toBeTruthy();
    const un = await request(app).patch(`/api/unit-listings/${u.id}/unpublish`).set(staff());
    expect(un.body.listing.published).toBe(false);
  });
});
