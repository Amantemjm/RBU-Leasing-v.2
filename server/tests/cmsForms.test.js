import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { tokens } from "./helpers.js";

const app = createApp();
const admin = () => tokens.admin();

beforeEach(async () => { await prisma.cmsForm.deleteMany(); });

function post(body, token = admin()) {
  return request(app).post("/api/cms/forms").set("Authorization", `Bearer ${token}`).send(body);
}

describe("CMS forms (Super Admin form builder)", () => {
  it("creates a form, deriving a slug from the name", async () => {
    const res = await post({
      name: "Move-in Checklist",
      description: "Handover form",
      fields: [
        { key: "moveDate", label: "Move-in date", type: "date", required: true },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("move-in-checklist");
    expect(res.body.fields).toHaveLength(2);
    expect(res.body.fields[0]).toMatchObject({ key: "moveDate", type: "date", required: true });
  });

  it("makes slugs unique across forms", async () => {
    const a = await post({ name: "Contact" });
    const b = await post({ name: "Contact" });
    expect(a.body.slug).toBe("contact");
    expect(b.body.slug).toBe("contact-2");
  });

  it("lists forms newest-updated first", async () => {
    await post({ name: "First" });
    await post({ name: "Second" });
    const res = await request(app).get("/api/cms/forms").set("Authorization", `Bearer ${admin()}`);
    expect(res.status).toBe(200);
    expect(res.body.map((f) => f.name)).toEqual(["Second", "First"]);
  });

  it("updates fields and refreshes the slug when the name changes", async () => {
    const created = await post({ name: "Draft" });
    const res = await request(app)
      .patch(`/api/cms/forms/${created.body.id}`)
      .set("Authorization", `Bearer ${admin()}`)
      .send({
        name: "Tenant Survey",
        fields: [{ key: "rating", label: "Rating", type: "select", options: ["Good", "Bad"] }],
      });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Tenant Survey");
    expect(res.body.slug).toBe("tenant-survey");
    expect(res.body.fields[0].options).toEqual(["Good", "Bad"]);
  });

  it("deletes a form", async () => {
    const created = await post({ name: "Temp" });
    const del = await request(app)
      .delete(`/api/cms/forms/${created.body.id}`)
      .set("Authorization", `Bearer ${admin()}`);
    expect(del.status).toBe(204);
    const after = await request(app).get("/api/cms/forms").set("Authorization", `Bearer ${admin()}`);
    expect(after.body).toHaveLength(0);
  });

  it("rejects a choice field with no options", async () => {
    const res = await post({
      name: "Bad",
      fields: [{ key: "pick", label: "Pick", type: "select" }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate field keys", async () => {
    const res = await post({
      name: "Dupe",
      fields: [
        { key: "a", label: "A", type: "text" },
        { key: "a", label: "A again", type: "text" },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("forbids non-admins", async () => {
    const asOfficer = await post({ name: "Nope" }, tokens.officer());
    expect(asOfficer.status).toBe(403);
    const asViewer = await request(app).get("/api/cms/forms").set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(asViewer.status).toBe(403);
    const anon = await request(app).get("/api/cms/forms");
    expect(anon.status).toBe(401);
  });
});
