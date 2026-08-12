import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

const valid = {
  category: "RESIDENCES",
  fullName: "Maria Santos",
  email: "maria@example.com",
  message: "I'm interested in a 2BR unit.",
  consent: true,
};

describe("Inquiries", () => {
  it("accepts a public inquiry with no auth (201)", async () => {
    const res = await request(app).post("/api/inquiries").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe("NEW");
  });

  it("rejects when consent is false (400)", async () => {
    const res = await request(app).post("/api/inquiries").send({ ...valid, consent: false });
    expect(res.status).toBe(400);
  });

  it("rejects when consent is missing (400)", async () => {
    const { consent, ...noConsent } = valid;
    const res = await request(app).post("/api/inquiries").send(noConsent);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email (400)", async () => {
    const res = await request(app).post("/api/inquiries").send({ ...valid, email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects an empty required field (400)", async () => {
    const res = await request(app).post("/api/inquiries").send({ ...valid, fullName: "" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid category (400)", async () => {
    const res = await request(app).post("/api/inquiries").send({ ...valid, category: "SHOPS" });
    expect(res.status).toBe(400);
  });

  it("requires auth to list (401)", async () => {
    const res = await request(app).get("/api/inquiries");
    expect(res.status).toBe(401);
  });

  it("lists for staff, newest first (200)", async () => {
    await request(app).post("/api/inquiries").send({ ...valid, fullName: "First" });
    await request(app).post("/api/inquiries").send({ ...valid, fullName: "Second" });
    const res = await request(app).get("/api/inquiries").set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].fullName).toBe("Second");
  });

  it("write role updates the status (200)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const res = await request(app).patch(`/api/inquiries/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  it("rejects an invalid status (400)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const res = await request(app).patch(`/api/inquiries/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ status: "ARCHIVED" });
    expect(res.status).toBe(400);
  });

  it("viewer cannot update or delete (403)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const patch = await request(app).patch(`/api/inquiries/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`).send({ status: "CLOSED" });
    expect(patch.status).toBe(403);
    const del = await request(app).delete(`/api/inquiries/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(del.status).toBe(403);
  });

  async function makeUser(role, email) {
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: `User ${role}`, email, password: "pw123456", role });
    return res.body;
  }

  it("admin assigns an inquiry to an O-Lease (200)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const officer = await makeUser("LEASING_OFFICER", "jane@x.com");
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ assignedToId: officer.id });
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(officer.id);
    expect(res.body.assignedTo.name).toBe("User LEASING_OFFICER");
  });

  it("admin can unassign an inquiry (200)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const officer = await makeUser("LEASING_OFFICER", "jane@x.com");
    await request(app).patch(`/api/inquiries/${created.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ assignedToId: officer.id });
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ assignedToId: null });
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBeNull();
  });

  it("rejects assigning to a non-O-Lease user (400)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const viewer = await makeUser("VIEWER", "val@x.com");
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ assignedToId: viewer.id });
    expect(res.status).toBe(400);
  });

  it("a non-admin cannot assign (403)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ assignedToId: "anything" });
    expect(res.status).toBe(403);
  });

  it("write role deletes an inquiry (204)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const res = await request(app).delete(`/api/inquiries/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(204);
  });
});
