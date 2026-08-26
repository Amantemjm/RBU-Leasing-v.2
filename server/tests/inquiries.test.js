import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { issueToken } from "../src/services/authService.js";
import { INQUIRY_TYPES } from "../../shared/inquiryTypes.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

const valid = {
  category: "RESIDENCES",
  inquirerType: "LESSEE",
  inquiryType: "Unit Availability",
  fullName: "Maria Santos",
  email: "maria@example.com",
  message: "I'm interested in a 2BR unit.",
  consent: true,
};

// The lessor list has to cover the whole lease lifecycle, not just onboarding
// a new unit — renewals and pre-terminations are recurring leasing work and
// were previously landing in "General Inquiry", invisible to reporting.
const NEW_LESSOR_TYPES = [
  "Update Listing",
  "Tenant Screening",
  "Lease Renewal",
  "Lease Pre-termination",
];

describe("Lessor inquiry types", () => {
  it("offers every lifecycle stage a lessor can ask about", () => {
    for (const t of NEW_LESSOR_TYPES) expect(INQUIRY_TYPES.LESSOR).toContain(t);
  });

  it.each(NEW_LESSOR_TYPES)("accepts a public LESSOR inquiry of type %s", async (inquiryType) => {
    const res = await request(app).post("/api/inquiries")
      .send({ ...valid, inquirerType: "LESSOR", inquiryType });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ inquirerType: "LESSOR", inquiryType });
  });

  it("keeps the lessee list free of lessor-only types", () => {
    for (const t of NEW_LESSOR_TYPES) expect(INQUIRY_TYPES.LESSEE).not.toContain(t);
  });

  it("rejects a lessor-only type submitted as a lessee (400)", async () => {
    const res = await request(app).post("/api/inquiries")
      .send({ ...valid, inquirerType: "LESSEE", inquiryType: "Lease Renewal" });
    expect(res.status).toBe(400);
  });

  it("still rejects a type that is on neither list (400)", async () => {
    const res = await request(app).post("/api/inquiries")
      .send({ ...valid, inquirerType: "LESSOR", inquiryType: "Sell My Unit" });
    expect(res.status).toBe(400);
  });
});

describe("Inquiries", () => {
  it("accepts a public LESSEE inquiry with no auth (201)", async () => {
    const res = await request(app).post("/api/inquiries").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body).toMatchObject({ inquirerType: "LESSEE", inquiryType: "Unit Availability" });
  });

  it("accepts a public LESSOR inquiry (201)", async () => {
    const res = await request(app).post("/api/inquiries")
      .send({ ...valid, inquirerType: "LESSOR", inquiryType: "Find a Tenant" });
    expect(res.status).toBe(201);
    expect(res.body.inquirerType).toBe("LESSOR");
  });

  it("accepts a submission with no message (message is optional) (201)", async () => {
    const { message, ...noMessage } = valid;
    const res = await request(app).post("/api/inquiries").send(noMessage);
    expect(res.status).toBe(201);
  });

  it("rejects an inquiryType not allowed for the inquirerType (400)", async () => {
    // "Find a Tenant" is a LESSOR type, not valid for a LESSEE
    const res = await request(app).post("/api/inquiries")
      .send({ ...valid, inquirerType: "LESSEE", inquiryType: "Find a Tenant" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing inquirerType (400)", async () => {
    const { inquirerType, ...rest } = valid;
    const res = await request(app).post("/api/inquiries").send(rest);
    expect(res.status).toBe(400);
  });

  it("rejects a missing inquiryType (400)", async () => {
    const { inquiryType, ...rest } = valid;
    const res = await request(app).post("/api/inquiries").send(rest);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid inquirerType (400)", async () => {
    const res = await request(app).post("/api/inquiries").send({ ...valid, inquirerType: "AGENT" });
    expect(res.status).toBe(400);
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

  it("an O-Lease sees their own + unassigned inquiries, but not another officer's", async () => {
    const mine = await request(app).post("/api/inquiries").send({ ...valid, fullName: "For Jane" });
    await request(app).post("/api/inquiries").send({ ...valid, fullName: "For Nobody" }); // unassigned pool
    const theirs = await request(app).post("/api/inquiries").send({ ...valid, fullName: "For Bob" });
    const jane = await makeUser("LEASING_OFFICER", "jane@x.com");
    const bob = await makeUser("LEASING_OFFICER", "bob@x.com");
    await request(app).patch(`/api/inquiries/${mine.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ assignedToId: jane.id });
    await request(app).patch(`/api/inquiries/${theirs.body.id}/assign`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ assignedToId: bob.id });

    const janeToken = issueToken({ id: jane.id, role: "LEASING_OFFICER" });
    const res = await request(app).get("/api/inquiries").set("Authorization", `Bearer ${janeToken}`);
    expect(res.status).toBe(200);
    const names = res.body.map((r) => r.fullName).sort();
    expect(names).toEqual(["For Jane", "For Nobody"]); // own + unassigned, not Bob's
  });

  it("an O-Lease accepts (self-assigns) an unassigned inquiry (200)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const jane = await makeUser("LEASING_OFFICER", "jane@x.com");
    const janeToken = issueToken({ id: jane.id, role: "LEASING_OFFICER" });
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${janeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(jane.id);
    expect(res.body.assignedTo.name).toBe("User LEASING_OFFICER");
  });

  it("an O-Lease cannot accept an inquiry already accepted by another (409)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const bob = await makeUser("LEASING_OFFICER", "bob@x.com");
    const jane = await makeUser("LEASING_OFFICER", "jane@x.com");
    await request(app).patch(`/api/inquiries/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${issueToken({ id: bob.id, role: "LEASING_OFFICER" })}`);
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${issueToken({ id: jane.id, role: "LEASING_OFFICER" })}`);
    expect(res.status).toBe(409);
  });

  it("an O-Lease releases their own inquiry back to the pool (200)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const jane = await makeUser("LEASING_OFFICER", "jane@x.com");
    const janeToken = issueToken({ id: jane.id, role: "LEASING_OFFICER" });
    await request(app).patch(`/api/inquiries/${created.body.id}/accept`).set("Authorization", `Bearer ${janeToken}`);
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/release`).set("Authorization", `Bearer ${janeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBeNull();
  });

  it("an O-Lease cannot release another officer's inquiry (409)", async () => {
    const created = await request(app).post("/api/inquiries").send(valid);
    const bob = await makeUser("LEASING_OFFICER", "bob@x.com");
    const jane = await makeUser("LEASING_OFFICER", "jane@x.com");
    await request(app).patch(`/api/inquiries/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${issueToken({ id: bob.id, role: "LEASING_OFFICER" })}`);
    const res = await request(app).patch(`/api/inquiries/${created.body.id}/release`)
      .set("Authorization", `Bearer ${issueToken({ id: jane.id, role: "LEASING_OFFICER" })}`);
    expect(res.status).toBe(409);
  });

  it("admin sees every inquiry regardless of assignment", async () => {
    await request(app).post("/api/inquiries").send({ ...valid, fullName: "A" });
    await request(app).post("/api/inquiries").send({ ...valid, fullName: "B" });
    const res = await request(app).get("/api/inquiries").set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.body).toHaveLength(2);
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
