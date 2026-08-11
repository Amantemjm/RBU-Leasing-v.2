import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

function binaryParser(res, cb) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (c) => { data += c; });
  res.on("end", () => cb(null, Buffer.from(data, "binary")));
}

describe("tenant requirements", () => {
  it("tenant uploads a document; it appears in their list without the bytes", async () => {
    const t = await factory.tenant();
    const up = await request(app).post("/api/requirements")
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`)
      .attach("file", Buffer.from("PDF-BYTES"), { filename: "id.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect(up.body.filename).toBe("id.pdf");
    expect(up.body.data).toBeUndefined();

    const list = await request(app).get("/api/requirements").set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].data).toBeUndefined();
  });

  it("downloads the uploaded bytes", async () => {
    const t = await factory.tenant();
    const r = await factory.requirement(t.id, { filename: "x.pdf", data: Buffer.from("HELLO"), size: 5 });
    const res = await request(app).get(`/api/requirements/${r.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("x.pdf");
    expect(res.body.toString()).toBe("HELLO");
  });

  it("admin sees all tenants' requirements", async () => {
    const t1 = await factory.tenant();
    const t2 = await factory.tenant({ name: "T2" });
    await factory.requirement(t1.id);
    await factory.requirement(t2.id);
    const res = await request(app).get("/api/requirements").set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.body).toHaveLength(2);
  });

  it("a tenant cannot download another tenant's requirement (404)", async () => {
    const t1 = await factory.tenant();
    const t2 = await factory.tenant({ name: "T2" });
    const r = await factory.requirement(t2.id);
    const res = await request(app).get(`/api/requirements/${r.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(t1.id)}`);
    expect(res.status).toBe(404);
  });
});
