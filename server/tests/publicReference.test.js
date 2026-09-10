import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { factory, resetCrudTables } from "./helpers.js";

// The signup page is signed out, so it cannot use /api/estates or /api/towers —
// both sit behind verifyJwt. These endpoints exist so a lessor can pick their
// estate and tower while applying. They expose names only: the same information
// the published listings already carry.
//
// Every test creates its own reference data. `resetCrudTables` deletes estates
// and towers, so asserting against whatever happens to be in the database would
// pass or fail depending on which test file ran last.
const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/public/estates", () => {
  it("lists estates with no token, exposing only id and name", async () => {
    const estate = await factory.estate({ name: "Capitol Commons" });
    const res = await request(app).get("/api/public/estates");
    expect(res.status).toBe(200);
    const row = res.body.find((e) => e.id === estate.id);
    expect(row).toBeDefined();
    expect(row.name).toBe("Capitol Commons");
    expect(Object.keys(row).sort()).toEqual(["id", "name"]);
  });
});

describe("GET /api/public/towers", () => {
  it("lists only the named estate's towers, with no token", async () => {
    const estate = await factory.estate({ name: "Capitol Commons" });
    await factory.tower(estate.id, { name: "Empress" });
    const other = await factory.estate({ name: "Circulo Verde" });
    await factory.tower(other.id, { name: "Elsewhere" });

    const res = await request(app).get("/api/public/towers").query({ estateId: estate.id });
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.name)).toEqual(["Empress"]);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  // Without a scope this would dump every tower in the portfolio.
  it("refuses to list towers without an estateId", async () => {
    const res = await request(app).get("/api/public/towers");
    expect(res.status).toBe(400);
  });
});
