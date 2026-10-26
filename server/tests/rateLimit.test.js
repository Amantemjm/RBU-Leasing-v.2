import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { makeLimiter } from "../src/middleware/rateLimit.js";
import { createApp } from "../src/app.js";

// The public endpoints — sign-in, sign-up, inquiry — take no token, so nothing
// else stops a script hammering them. These pin the throttle, and that it counts
// the right thing: only FAILED sign-ins, so a busy office is never locked out by
// its own successful logins.
const app = createApp();

describe("makeLimiter", () => {
  function appWith(limiter) {
    const a = express();
    a.use(express.json());
    a.post("/try", limiter, (req, res) => (req.body.ok ? res.json({ ok: true }) : res.status(401).json({ error: "nope" })));
    return a;
  }

  it("answers 429 with the app's own error shape once the limit is passed", async () => {
    const a = appWith(makeLimiter({ windowMs: 60_000, limit: 2, message: "Slow down.", skip: () => false }));
    expect((await request(a).post("/try").send({ ok: true })).status).toBe(200);
    expect((await request(a).post("/try").send({ ok: true })).status).toBe(200);
    const res = await request(a).post("/try").send({ ok: true });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Slow down." });
  });

  it("counts only failures when asked to, so successes never lock anyone out", async () => {
    const a = appWith(makeLimiter({ windowMs: 60_000, limit: 2, skipSuccessfulRequests: true, message: "Slow down.", skip: () => false }));
    for (let i = 0; i < 6; i++) expect((await request(a).post("/try").send({ ok: true })).status).toBe(200);
    expect((await request(a).post("/try").send({ ok: false })).status).toBe(401);
    expect((await request(a).post("/try").send({ ok: false })).status).toBe(401);
    // two failures used the allowance; the next attempt of any kind is refused
    expect((await request(a).post("/try").send({ ok: true })).status).toBe(429);
  });

  it("is switched off under the test runner so the rest of the suite is not throttled", async () => {
    const a = appWith(makeLimiter({ windowMs: 60_000, limit: 1, message: "Slow down." }));
    for (let i = 0; i < 4; i++) expect((await request(a).post("/try").send({ ok: true })).status).toBe(200);
  });
});

describe("the real public routes", () => {
  afterEach(() => { delete process.env.RATE_LIMIT; });

  it("throttles repeated failed sign-ins", async () => {
    process.env.RATE_LIMIT = "on";
    let last;
    for (let i = 0; i < 25; i++) {
      last = await request(app).post("/api/auth/login").send({ email: "nobody-here", password: "wrong-password" });
      if (last.status === 429) break;
    }
    expect(last.status).toBe(429);
    expect(last.body.error).toMatch(/too many/i);
  });
});
