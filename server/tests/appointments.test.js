import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

// Seed a transaction sitting at UNIT_INSPECTION, linked to an owner + tenant.
async function txnAtInspection() {
  const owner = await factory.owner({ name: "Owner Co" });
  const tenant = await factory.tenant({ name: "Lessee Co" });
  return prisma.leasingTransaction.create({
    data: {
      reference: "RBU-2026-000001", stage: "UNIT_INSPECTION", status: "Pending",
      stageData: { UNIT_INSPECTION: { status: "Pending", startedAt: new Date().toISOString() } },
      tenantId: tenant.id, unitOwnerId: owner.id,
    },
  });
}

describe("Appointments — schedule/list", () => {
  it("officer schedules an inspection → row Scheduled, stage synced, event logged", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ scheduledAt: "2026-09-01T09:00:00.000Z", location: "Tower A Lobby", notes: "Bring IDs" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Scheduled");
    expect(res.body.stage).toBe("UNIT_INSPECTION");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Scheduled");
    expect(txn.stageData.UNIT_INSPECTION.status).toBe("Scheduled");
    const events = await prisma.transactionEvent.findMany({ where: { transactionId: t.id } });
    expect(events.some((e) => /schedul/i.test(e.message))).toBe(true);
  });

  it("rejects a non-schedulable stage (400)", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/APPROVAL`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing/invalid scheduledAt (400)", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ location: "x" });
    expect(res.status).toBe(400);
  });

  it("second schedule for the same stage upserts (no duplicate)", async () => {
    const t = await txnAtInspection();
    const hdr = { Authorization: `Bearer ${tokens.officer()}` };
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`).set(hdr).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`).set(hdr).send({ scheduledAt: "2026-09-02T09:00:00.000Z" });
    const rows = await prisma.appointment.findMany({ where: { transactionId: t.id, stage: "UNIT_INSPECTION" } });
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].scheduledAt).toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });

  it("a unit owner cannot schedule (403) but can read their own (200); a stranger 404s", async () => {
    const t = await txnAtInspection();
    const owner = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    const w = await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.owner(owner.unitOwnerId)}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    expect(w.status).toBe(403);
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`).set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    const readOwn = await request(app).get(`/api/appointments/transaction/${t.id}`).set("Authorization", `Bearer ${tokens.owner(owner.unitOwnerId)}`);
    expect(readOwn.status).toBe(200);
    expect(readOwn.body).toHaveLength(1);
    const stranger = await request(app).get(`/api/appointments/transaction/${t.id}`).set("Authorization", `Bearer ${tokens.owner("other-owner")}`);
    expect(stranger.status).toBe(404);
  });

  it("GET /mine scopes to the caller: linked owner/tenant see it, others don't", async () => {
    const t = await txnAtInspection();
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });

    const ownerRes = await request(app).get("/api/appointments/mine")
      .set("Authorization", `Bearer ${tokens.owner(t.unitOwnerId)}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body).toHaveLength(1);

    const tenantRes = await request(app).get("/api/appointments/mine")
      .set("Authorization", `Bearer ${tokens.tenant(t.tenantId)}`);
    expect(tenantRes.status).toBe(200);
    expect(tenantRes.body).toHaveLength(1);

    const strangerRes = await request(app).get("/api/appointments/mine")
      .set("Authorization", `Bearer ${tokens.owner("someone-else")}`);
    expect(strangerRes.status).toBe(200);
    expect(strangerRes.body).toEqual([]);

    const officerRes = await request(app).get("/api/appointments/mine")
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(officerRes.status).toBe(200);
    expect(officerRes.body).toEqual([]);
  });

  it("scheduling a non-current schedulable stage syncs only stageData, not top-level status", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/KEY_TURNOVER`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-05T09:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe("KEY_TURNOVER");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Pending");
    expect(txn.stageData.KEY_TURNOVER.status).toBe("Scheduled");
  });

  it("scheduling against an unknown transaction 404s", async () => {
    const res = await request(app).post("/api/appointments/transaction/does-not-exist/UNIT_INSPECTION")
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    expect(res.status).toBe(404);
  });
});

describe("Appointments — lifecycle", () => {
  async function scheduled(stage = "UNIT_INSPECTION") {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/${stage}`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    return { t, id: res.body.id };
  }

  it("reschedule updates time, sets Rescheduled, increments count", async () => {
    const { id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/reschedule`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-05T10:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Rescheduled");
    expect(res.body.rescheduleCount).toBe(1);
  });

  it("complete without outcome applies the stage default (turnover → Completed)", async () => {
    // seed a txn at KEY_TURNOVER
    const owner = await factory.owner(); const tenant = await factory.tenant();
    const t = await prisma.leasingTransaction.create({ data: {
      reference: "RBU-2026-000009", stage: "KEY_TURNOVER", status: "Pending",
      stageData: { KEY_TURNOVER: { status: "Pending" } }, tenantId: tenant.id, unitOwnerId: owner.id } });
    const s = await request(app).post(`/api/appointments/transaction/${t.id}/KEY_TURNOVER`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    const res = await request(app).patch(`/api/appointments/${s.body.id}/complete`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Completed");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Completed");
  });

  it("complete an inspection with outcome Failed sets the stage to Failed", async () => {
    const { t, id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Failed" });
    expect(res.status).toBe(200);
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Failed");
  });

  it("rejects an outcome that isn't valid for the stage (400)", async () => {
    const { id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Completed" }); // not an inspection status
    expect(res.status).toBe(400);
  });

  it("cancel sets the stage back to Pending; No-show is accepted", async () => {
    const { t, id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/cancel`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "No-show", reason: "party absent" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("No-show");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Pending");
  });

  it("completing an already-completed appointment 409s; owner cannot complete (403)", async () => {
    const { t, id } = await scheduled();
    const owner = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    const forbidden = await request(app).patch(`/api/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${tokens.owner(owner.unitOwnerId)}`).send({});
    expect(forbidden.status).toBe(403);
    await request(app).patch(`/api/appointments/${id}/complete`).set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Passed" });
    const again = await request(app).patch(`/api/appointments/${id}/complete`).set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Passed" });
    expect(again.status).toBe(409);
  });
});
