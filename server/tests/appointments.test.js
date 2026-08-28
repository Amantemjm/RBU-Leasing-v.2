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
});
