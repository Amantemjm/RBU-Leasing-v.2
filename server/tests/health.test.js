import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

// The health check exists so something outside the process can tell whether
// this service is actually working. It used to answer `{ ok: true }` from a
// literal, which meant it stayed green through a total database outage — the
// site served its shell, every data endpoint returned 500, and the one signal
// anyone would have watched reported healthy the whole time.
//
// So it has to reach the database. A health check that cannot fail is not a
// health check.
const app = createApp();

afterEach(() => { vi.restoreAllMocks(); });

describe("GET /api/health", () => {
  it("reaches the database and says so", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe("up");
  });

  it("reports 503 when the database cannot be reached", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
      new Error('password authentication failed for user "postgres"'),
    );
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.db).toBe("down");
  });

  // A monitor that only reads the status code still has to see the failure,
  // and a human reading the body needs to know which half broke.
  it("does not leak the database error to the caller", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
      new Error('password authentication failed for user "postgres"'),
    );
    const res = await request(app).get("/api/health");
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect(JSON.stringify(res.body)).not.toContain("postgres");
  });

  it("stays open to callers with no token", async () => {
    // Monitoring has no credentials; health must sit ahead of every guard.
    const res = await request(app).get("/api/health");
    expect(res.status).not.toBe(401);
  });
});
