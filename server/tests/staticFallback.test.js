import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// The SPA fallback answers any unmatched GET with index.html so client-side
// routing works on a deep link. Applied to /assets/ as well, it turns a missing
// build artefact into an HTTP 200 carrying HTML, which the browser then tries to
// execute as JavaScript: the app never boots, the page is blank, and the network
// tab shows nothing but 200s.
//
// This is not hypothetical. A browser holding a previous build's cached
// index.html requests that build's fingerprinted bundle on every load, and after
// a redeploy that file is gone. The failure has to be a 404 so it reads as
// "your cache is stale" rather than as a silent, successful nothing.
//
// The fallback is gated on NODE_ENV=production, so these tests set it around
// app construction.
let app;
const previousEnv = process.env.NODE_ENV;

beforeAll(() => {
  process.env.NODE_ENV = "production";
  app = createApp();
});
afterAll(() => { process.env.NODE_ENV = previousEnv; });

describe("Production static fallback", () => {
  it("404s a build artefact that no longer exists, rather than serving HTML", async () => {
    const res = await request(app).get("/assets/index-GONEHASH.js");
    expect(res.status).toBe(404);
    expect(res.text || "").not.toContain("<!doctype html");
  });

  it("does not answer a missing stylesheet with HTML either", async () => {
    const res = await request(app).get("/assets/index-GONEHASH.css");
    expect(res.status).toBe(404);
  });

  it("still falls back to index.html for a client-side route", async () => {
    const res = await request(app).get("/register-unit");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!doctype html");
    // The shell must never be cached, or a browser keeps booting an old build.
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("leaves unmatched API routes to the API, not the SPA shell", async () => {
    const res = await request(app).get("/api/definitely-not-a-route");
    expect(res.text || "").not.toContain("<!doctype html");
  });
});
