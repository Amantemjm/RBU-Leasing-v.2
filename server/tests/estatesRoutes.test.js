import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/estates", () => {
  it("returns estates with their towers (viewer allowed)", async () => {
    const e = await factory.estate({ name: "Capitol Commons" });
    await factory.tower(e.id, { name: "The Royalton at Capitol Commons" });
    await factory.tower(e.id, { name: "Maven at Capitol Commons" });

    const res = await request(app).get("/api/estates")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Capitol Commons");
    expect(res.body[0].towers.map((t) => t.name).sort()).toEqual([
      "Maven at Capitol Commons",
      "The Royalton at Capitol Commons",
    ]);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/estates");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/towers", () => {
  it("filters towers by estateId", async () => {
    const a = await factory.estate({ name: "A Estate" });
    const b = await factory.estate({ name: "B Estate" });
    await factory.tower(a.id, { name: "A-T1" });
    await factory.tower(b.id, { name: "B-T1" });

    const res = await request(app).get(`/api/towers?estateId=${a.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("A-T1");
  });
});
