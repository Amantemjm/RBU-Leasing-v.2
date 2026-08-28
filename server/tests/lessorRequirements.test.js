import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const pdf = () => Buffer.from("%PDF-1.4 test");

describe("Lessor requirements checklist", () => {
  it("returns all seven items, missing ones as Required, no bytes", async () => {
    const o = await factory.owner();
    const res = await request(app).get("/api/lessor-requirements/mine").set(auth(tokens.owner(o.id)));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body.every((r) => r.status)).toBe(true);
    expect(res.body.find((r) => r.requirementKey === "GOV_ID").status).toBe("Required");
    expect(res.body.every((r) => r.data === undefined)).toBe(true);
  });

  it("owner uploads a document -> Submitted, own-only", async () => {
    const o = await factory.owner();
    const up = await request(app).post("/api/lessor-requirements/mine/GOV_ID")
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "id.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect(up.body.status).toBe("Submitted");
    expect(up.body.data).toBeUndefined();

    const other = await factory.owner({ name: "Two" });
    const list = await request(app).get("/api/lessor-requirements/mine").set(auth(tokens.owner(o.id)));
    expect(list.body.find((r) => r.requirementKey === "GOV_ID").status).toBe("Submitted");
    // owner cannot upload for another owner via the staff path
    const cross = await request(app).post(`/api/lessor-requirements/${other.id}/GOV_ID`)
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "x.pdf", contentType: "application/pdf" });
    expect(cross.status).toBe(403);
  });

  it("rejects an unknown requirement key", async () => {
    const o = await factory.owner();
    const res = await request(app).post("/api/lessor-requirements/mine/NOPE")
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
  });

  it("staff uploads on behalf and reviews with a status + remark", async () => {
    const o = await factory.owner();
    const up = await request(app).post(`/api/lessor-requirements/${o.id}/OWNERSHIP`)
      .set(auth(tokens.officer())).attach("file", pdf(), { filename: "title.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    const rev = await request(app).patch(`/api/lessor-requirements/${up.body.id}/review`)
      .set(auth(tokens.officer())).send({ status: "Approved", remarks: "Verified" });
    expect(rev.body.status).toBe("Approved");
    expect(rev.body.remarks).toBe("Verified");

    const bad = await request(app).patch(`/api/lessor-requirements/${up.body.id}/review`)
      .set(auth(tokens.officer())).send({ status: "Bogus" });
    expect(bad.status).toBe(400);
  });

  it("scopes downloads to the owner or staff", async () => {
    const o = await factory.owner(); const other = await factory.owner({ name: "Two" });
    const up = await request(app).post("/api/lessor-requirements/mine/TAX_DEC")
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "t.pdf", contentType: "application/pdf" });
    const mine = await request(app).get(`/api/lessor-requirements/${up.body.id}/download`).set(auth(tokens.owner(o.id)));
    expect(mine.status).toBe(200);
    const theirs = await request(app).get(`/api/lessor-requirements/${up.body.id}/download`).set(auth(tokens.owner(other.id)));
    expect(theirs.status).toBe(404);
    const staff = await request(app).get(`/api/lessor-requirements/${up.body.id}/download`).set(auth(tokens.officer()));
    expect(staff.status).toBe(200);
  });
});
