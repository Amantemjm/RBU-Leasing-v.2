import { describe, it, expect, beforeEach } from "vitest";
import {
  LEASING_STAGES, STAGE_KEYS, stageIndex, nextStageKey, prevStageKey,
  SCHEDULABLE_STAGES, isSchedulableStage, APPOINTMENT_STATUSES, stageByKey,
} from "../../shared/leasingStages.js";

describe("UNIT_VIEWING stage registry", () => {
  it("sits between INQUIRY and SEND_REQUIREMENTS", () => {
    expect(STAGE_KEYS).toHaveLength(7);
    expect(stageIndex("UNIT_VIEWING")).toBe(1);
    expect(nextStageKey("INQUIRY")).toBe("UNIT_VIEWING");
    expect(nextStageKey("UNIT_VIEWING")).toBe("SEND_REQUIREMENTS");
    expect(prevStageKey("SEND_REQUIREMENTS")).toBe("UNIT_VIEWING");
  });

  it("is schedulable with the viewing outcomes and the Interested done-status", () => {
    expect(isSchedulableStage("UNIT_VIEWING")).toBe(true);
    expect(SCHEDULABLE_STAGES.UNIT_VIEWING.outcomeOptions).toEqual(["Interested", "Not Interested", "No-show"]);
    expect(stageByKey("UNIT_VIEWING").done).toBe("Interested");
    expect(stageByKey("UNIT_VIEWING").statuses).toEqual(
      expect.arrayContaining(["Pending", "Proposed", "Confirmed", "Interested", "Not Interested", "No-show", "Skipped"]),
    );
  });

  it("adds Proposed and Confirmed appointment statuses", () => {
    expect(APPOINTMENT_STATUSES).toEqual(expect.arrayContaining(["Proposed", "Confirmed"]));
  });
});

import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { acceptInquiry } from "../src/services/inquiryService.js";

const app = createApp();

describe("Inquiry acceptance routes through Unit Viewing", () => {
  beforeEach(async () => {
    await resetCrudTables();
    // acceptInquiry writes assignedToId (FK -> User.id) directly, unlike the
    // HTTP calls below which only decode the Bearer JWT's claims — so the
    // "test-officer" actor id used to call it directly must be a real row.
    await prisma.user.create({
      data: { id: "test-officer", name: "Test Officer", email: "test-officer@test.sim", passwordHash: "x", role: "LEASING_OFFICER" },
    });
  });

  async function lesseeInquiry(withUnit) {
    let unitId = null, ownerId = null;
    if (withUnit) {
      const owner = await factory.owner();
      const unit = await factory.unit(owner.id, { unitNumber: "9A", status: "VACANT", approvalStatus: "APPROVED" });
      unitId = unit.id; ownerId = owner.id;
    }
    const inq = await prisma.inquiry.create({ data: {
      category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Residential Lease",
      fullName: "Prospect P", email: "p@example.com", consent: true, status: "NEW", unitId,
    } });
    return { inq, unitId, ownerId };
  }

  it("rests a lessee inquiry WITH a unit at UNIT_VIEWING", async () => {
    const { inq } = await lesseeInquiry(true);
    await acceptInquiry({ userId: "test-officer", role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    expect(txn.stage).toBe("UNIT_VIEWING");
    expect(txn.status).toBe("Pending");
    expect(txn.stageData.INQUIRY.status).toBe("Qualified");
  });

  it("skips the viewing for a lessee inquiry with NO unit", async () => {
    const { inq } = await lesseeInquiry(false);
    await acceptInquiry({ userId: "test-officer", role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    expect(txn.stage).toBe("SEND_REQUIREMENTS");
    expect(txn.stageData.UNIT_VIEWING.status).toBe("Skipped");
  });

  it("blocks advancing out of UNIT_VIEWING until Interested or Skipped", async () => {
    const owner = await factory.owner();
    const t = await prisma.leasingTransaction.create({ data: {
      reference: "RBU-2026-900001", stage: "UNIT_VIEWING", status: "Confirmed",
      stageData: { UNIT_VIEWING: { status: "Confirmed", startedAt: new Date().toISOString() } },
      unitOwnerId: owner.id,
    } });
    const blocked = await request(app).patch(`/api/leasing-transactions/${t.id}/advance`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({});
    expect(blocked.status).toBe(409);

    await request(app).patch(`/api/leasing-transactions/${t.id}/status`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "Interested" });
    const ok = await request(app).patch(`/api/leasing-transactions/${t.id}/advance`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.stage).toBe("SEND_REQUIREMENTS");
  });
});
