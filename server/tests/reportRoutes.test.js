import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

function binaryParser(res, cb) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => cb(null, Buffer.from(data, "binary")));
}

async function seed() {
  const o = await factory.owner();
  const u = await factory.unit(o.id);
  const t = await factory.tenant();
  const lease = await factory.lease(u.id, t.id);
  await factory.payment(lease.id, { amount: 25000, paidDate: new Date(2026, 5, 10) });
}

describe("report downloads", () => {
  for (const path of ["rent-roll", "collections", "lease-expiry", "owner-statement"]) {
    it(`GET /api/reports/${path} returns an xlsx attachment`, async () => {
      await seed();
      const res = await request(app).get(`/api/reports/${path}`)
        .set("Authorization", `Bearer ${tokens.viewer()}`)
        .buffer().parse(binaryParser);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("spreadsheetml");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.slice(0, 2).toString()).toBe("PK");
    });
  }

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/reports/rent-roll");
    expect(res.status).toBe(401);
  });
});
