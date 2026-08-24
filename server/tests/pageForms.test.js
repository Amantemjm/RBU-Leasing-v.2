import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";
import { resetCrudTables, tokens } from "./helpers.js";

const app = createApp();
const admin = () => tokens.admin();

beforeEach(async () => {
  await prisma.pageFormEntry.deleteMany();
  await prisma.pageForm.deleteMany();
  await resetCrudTables();
});

// A real User row so PageFormEntry's userId FK is satisfied, plus a token for it.
async function makeTenantUser() {
  const user = await prisma.user.create({
    data: { name: "Tina Tenant", email: `tina-${Date.now()}@ex.com`, passwordHash: "x", role: "TENANT" },
  });
  return { user, token: issueToken({ id: user.id, role: "TENANT" }) };
}

const cfg = (role, key) => `/api/cms/page-forms/${role}/${key}`;

describe("CMS page forms (per-nav slot configuration)", () => {
  it("configures a slot and reads it back", async () => {
    const res = await request(app).put(cfg("TENANT", "profile"))
      .set("Authorization", `Bearer ${admin()}`)
      .send({ title: "Extra profile info", fields: [{ key: "nickname", label: "Nickname", type: "text" }] });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("TENANT");
    expect(res.body.pageKey).toBe("profile");

    const got = await request(app).get(cfg("TENANT", "profile")).set("Authorization", `Bearer ${admin()}`);
    expect(got.body.fields[0].key).toBe("nickname");
  });

  it("rejects an invalid (role, page) slot", async () => {
    const res = await request(app).put(cfg("TENANT", "dashboard"))
      .set("Authorization", `Bearer ${admin()}`)
      .send({ fields: [{ key: "x", label: "X", type: "text" }] });
    expect(res.status).toBe(400);
  });

  it("lists configured slots with a submission count", async () => {
    await request(app).put(cfg("UNIT_OWNER", "acceptance")).set("Authorization", `Bearer ${admin()}`)
      .send({ fields: [{ key: "a", label: "A", type: "text" }] });
    const res = await request(app).get("/api/cms/page-forms").set("Authorization", `Bearer ${admin()}`);
    expect(res.status).toBe(200);
    const slot = res.body.find((s) => s.role === "UNIT_OWNER" && s.pageKey === "acceptance");
    expect(slot).toBeTruthy();
    expect(slot.entryCount).toBe(0);
  });

  it("serves the configured fields to a matching role user and saves their submission", async () => {
    await request(app).put(cfg("TENANT", "profile")).set("Authorization", `Bearer ${admin()}`)
      .send({ title: "About you", fields: [{ key: "nickname", label: "Nickname", type: "text" }] });

    const { user, token } = await makeTenantUser();

    const mine = await request(app).get("/api/page-forms/mine/profile").set("Authorization", `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.fields[0].key).toBe("nickname");
    expect(mine.body.data).toBeNull();

    const saved = await request(app).put("/api/page-forms/mine/profile")
      .set("Authorization", `Bearer ${token}`).send({ data: { nickname: "Tinstar" } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.nickname).toBe("Tinstar");

    // admin sees the submission
    const entries = await request(app).get(cfg("TENANT", "profile") + "/entries").set("Authorization", `Bearer ${admin()}`);
    expect(entries.body).toHaveLength(1);
    expect(entries.body[0].user.id).toBe(user.id);
    expect(entries.body[0].data.nickname).toBe("Tinstar");
  });

  it("returns empty fields when a user's page has no configuration", async () => {
    const { token } = await makeTenantUser();
    const mine = await request(app).get("/api/page-forms/mine/profile").set("Authorization", `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.fields).toEqual([]);
  });

  it("won't save a submission when nothing is configured", async () => {
    const { token } = await makeTenantUser();
    const res = await request(app).put("/api/page-forms/mine/profile")
      .set("Authorization", `Bearer ${token}`).send({ data: { nickname: "x" } });
    expect(res.status).toBe(404);
  });

  it("forbids non-admins from configuring slots", async () => {
    const res = await request(app).put(cfg("TENANT", "profile")).set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ fields: [{ key: "x", label: "X", type: "text" }] });
    expect(res.status).toBe(403);
  });
});
