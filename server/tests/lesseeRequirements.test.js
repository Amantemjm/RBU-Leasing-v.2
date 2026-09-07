import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { LESSEE_REQUIREMENT_TYPES } from "../../shared/lesseeRequirements.js";

// The lessee submits a fixed checklist the same way the lessor does: one slot
// per document type, uploaded by the tenant, reviewed by staff. An untouched
// type is not a missing row — the checklist is completed from the shared config
// so it always reads as the full list.
const app = createApp();
beforeEach(async () => {
  await prisma.lesseeRequirement.deleteMany();
  await resetCrudTables();
});

const pdf = Buffer.from("%PDF-1.4 test");
const upload = (token, key) =>
  request(app).post(`/api/lessee-requirements/mine/${key}`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", pdf, { filename: "id.pdf", contentType: "application/pdf" });

describe("Lessee requirements checklist", () => {
  it("returns the whole checklist even before anything is uploaded", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const res = await request(app).get("/api/lessee-requirements/mine")
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(LESSEE_REQUIREMENT_TYPES.length);
    expect(res.body.every((r) => r.status === "Required")).toBe(true);
    expect(res.body[0].label).toBe("Valid Government ID");
  });

  it("keeps the checklist in the configured order", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const res = await request(app).get("/api/lessee-requirements/mine")
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
    expect(res.body.map((r) => r.requirementKey))
      .toEqual(LESSEE_REQUIREMENT_TYPES.map((t2) => t2.key));
  });

  it("marks a type Submitted once the lessee uploads it", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const res = await upload(tokens.tenant(t.id), "GOV_ID");
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Submitted");
    expect(res.body.filename).toBe("id.pdf");
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.data).toBeUndefined(); // the bytes never ride along
  });

  it("replaces an earlier upload rather than stacking duplicates", async () => {
    const t = await factory.tenant({ name: "Ana" });
    await upload(tokens.tenant(t.id), "GOV_ID");
    await upload(tokens.tenant(t.id), "GOV_ID");
    const rows = await prisma.lesseeRequirement.findMany({ where: { tenantId: t.id } });
    expect(rows).toHaveLength(1);
  });

  it("refuses a document type that is not on the checklist", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const res = await upload(tokens.tenant(t.id), "NOT_A_TYPE");
    expect(res.status).toBe(400);
  });

  it("clears a previous review when the lessee resubmits", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const first = await upload(tokens.tenant(t.id), "GOV_ID");
    await request(app).patch(`/api/lessee-requirements/${first.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ status: "Rejected", remarks: "Expired ID" });

    const again = await upload(tokens.tenant(t.id), "GOV_ID");
    expect(again.body.status).toBe("Submitted");
    expect(again.body.remarks).toBeNull();
    expect(again.body.reviewedAt).toBeNull();
  });

  it("lets staff review a submission and records who", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const up = await upload(tokens.tenant(t.id), "COE");
    const res = await request(app).patch(`/api/lessee-requirements/${up.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ status: "Approved", remarks: "Verified" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Approved");
    expect(res.body.reviewedAt).toBeTruthy();
  });

  it("shows staff a named tenant's checklist", async () => {
    const t = await factory.tenant({ name: "Ana" });
    await upload(tokens.tenant(t.id), "GOV_ID");
    const res = await request(app).get(`/api/lessee-requirements/${t.id}`)
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(LESSEE_REQUIREMENT_TYPES.length);
    expect(res.body.find((r) => r.requirementKey === "GOV_ID").status).toBe("Submitted");
  });

  it("scopes a lessee to their own checklist", async () => {
    const mine = await factory.tenant({ name: "Ana" });
    const theirs = await factory.tenant({ name: "Ben" });
    await upload(tokens.tenant(theirs.id), "GOV_ID");

    const res = await request(app).get("/api/lessee-requirements/mine")
      .set("Authorization", `Bearer ${tokens.tenant(mine.id)}`);
    expect(res.body.every((r) => r.status === "Required")).toBe(true);
  });

  it("keeps a lessee out of another tenant's checklist and out of review", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const up = await upload(tokens.tenant(t.id), "GOV_ID");
    const other = await factory.tenant({ name: "Ben" });

    expect((await request(app).get(`/api/lessee-requirements/${t.id}`)
      .set("Authorization", `Bearer ${tokens.tenant(other.id)}`)).status).toBe(403);
    expect((await request(app).patch(`/api/lessee-requirements/${up.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ status: "Approved" })).status).toBe(403);
  });

  it("serves the file back to its owner and to staff", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const up = await upload(tokens.tenant(t.id), "GOV_ID");
    for (const token of [tokens.tenant(t.id), tokens.officer()]) {
      const res = await request(app).get(`/api/lessee-requirements/${up.body.id}/download`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it("does not serve another lessee's file", async () => {
    const t = await factory.tenant({ name: "Ana" });
    const up = await upload(tokens.tenant(t.id), "GOV_ID");
    const other = await factory.tenant({ name: "Ben" });
    const res = await request(app).get(`/api/lessee-requirements/${up.body.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(other.id)}`);
    expect([403, 404]).toContain(res.status);
  });

  it("requires a signed-in user", async () => {
    expect((await request(app).get("/api/lessee-requirements/mine")).status).toBe(401);
  });
});
