import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("admin provisions owner/tenant accounts", () => {
  it("creates a UNIT_OWNER linked to an owner", async () => {
    const o = await factory.owner({ name: "Ayala" });
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Owner One", email: "owner1@x.com", password: "pw123456", role: "UNIT_OWNER", unitOwnerId: o.id });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("UNIT_OWNER");
    expect(res.body.unitOwnerId).toBe(o.id);
  });

  it("rejects a UNIT_OWNER without a valid owner (400)", async () => {
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "X", email: "x@x.com", password: "pw123456", role: "UNIT_OWNER", unitOwnerId: "ghost" });
    expect(res.status).toBe(400);
  });

  it("creates a TENANT linked to a tenant", async () => {
    const t = await factory.tenant({ name: "Juan" });
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Tenant One", email: "tenant1@x.com", password: "pw123456", role: "TENANT", tenantId: t.id });
    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBe(t.id);
  });

  it("creates a plain login (no owner/tenant link needed)", async () => {
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Front Desk", email: "frontdesk", password: "pw123456", role: "VIEWER" });
    expect(res.status).toBe(201);
    expect(res.body.unitOwnerId).toBeNull();
    expect(res.body.tenantId).toBeNull();
  });

  it("creates a UNIT_OWNER with no link (credential only)", async () => {
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Owner No Link", email: "ownernolink", password: "pw123456", role: "UNIT_OWNER" });
    expect(res.status).toBe(201);
    expect(res.body.unitOwnerId).toBeNull();
  });

  it("an unlinked owner sees no units (not all)", async () => {
    const o = await factory.owner();
    await factory.unit(o.id);
    const res = await request(app).get("/api/units").set("Authorization", `Bearer ${tokens.owner()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("lists credentials for an admin (no password hash)", async () => {
    await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Front Desk", email: "frontdesk", password: "pw123456", role: "VIEWER" });
    const res = await request(app).get("/api/auth/users").set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(200);
    const created = res.body.find((u) => u.email === "frontdesk");
    expect(created).toMatchObject({ name: "Front Desk", role: "VIEWER" });
    expect(created.passwordHash).toBeUndefined();
  });

  it("a viewer cannot list credentials (403)", async () => {
    const res = await request(app).get("/api/auth/users").set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(403);
  });

  it("a viewer cannot register users (403)", async () => {
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ name: "X", email: "y@x.com", password: "pw123456" });
    expect(res.status).toBe(403);
  });
});
