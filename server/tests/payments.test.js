import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function leaseFixture() {
  const owner = await factory.owner();
  const unit = await factory.unit(owner.id);
  const tenant = await factory.tenant();
  return factory.lease(unit.id, tenant.id);
}

describe("Payments CRUD", () => {
  it("officer records a payment for an existing lease", async () => {
    const lease = await leaseFixture();
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ leaseId: lease.id, periodMonth: "2026-01-01", amount: 30000, dueDate: "2026-01-05", status: "PAID", method: "GCASH" });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(30000);
    expect(res.body.status).toBe("PAID");
  });

  it("rejects a payment with a non-existent lease (400)", async () => {
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ leaseId: "ghost", periodMonth: "2026-01-01", amount: 1000, dueDate: "2026-01-05" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (400)", async () => {
    const lease = await leaseFixture();
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ leaseId: lease.id });
    expect(res.status).toBe(400);
  });

  it("filters payments by leaseId", async () => {
    const l1 = await leaseFixture();
    const l2 = await leaseFixture();
    await factory.payment(l1.id);
    await factory.payment(l2.id);
    const res = await request(app).get(`/api/payments?leaseId=${l1.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].leaseId).toBe(l1.id);
  });

  it("viewer cannot create (403)", async () => {
    const lease = await leaseFixture();
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ leaseId: lease.id, periodMonth: "2026-01-01", amount: 1000, dueDate: "2026-01-05" });
    expect(res.status).toBe(403);
  });

  it("deletes a payment (204) — no dependents", async () => {
    const lease = await leaseFixture();
    const payment = await factory.payment(lease.id);
    const res = await request(app).delete(`/api/payments/${payment.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(204);
  });
});
