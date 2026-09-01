import express, { Router } from "express";
import { z } from "zod";
import { NotFoundError, InvalidReferenceError, ValidationError, ConflictError } from "./errors.js";
import { verifyJwt, requireWrite, requireRole } from "../middleware/auth.js";
import { streamInfoSheetPdf } from "./infoSheetPdf.js";
import { prisma } from "./prisma.js";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const reviewSchema = z.object({
  status: z.enum(["APPROVED", "RETURNED"]),
  remarks: z.string().optional(),
});

// A generic info-sheet service. Applicants submit either structured DATA (filled
// in-system) or an uploaded/edited PDF stored in `binaryField` — both supported.
export function makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField, version = null, approveGuard = null }) {
  const include = { [relationName]: { select: { id: true, name: true } } };
  const readOpts = binaryField ? { include, omit: { [binaryField]: true } } : { include };

  // Best-effort display name for the acting user: login user -> owner -> tenant.
  async function resolveName(user) {
    if (!user) return null;
    if (user.userId) {
      const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, email: true } });
      if (u) return u.name || u.email || null;
    }
    if (user.unitOwnerId) {
      const o = await prisma.unitOwner.findUnique({ where: { id: user.unitOwnerId }, select: { name: true } });
      if (o) return o.name || null;
    }
    if (user.tenantId) {
      const t = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } });
      if (t) return t.name || null;
    }
    return null;
  }

  async function createRequest(parentId) {
    if (!parentId) throw new InvalidReferenceError(`${fkField} is required`);
    const parent = await parentModel.findUnique({ where: { id: parentId } });
    if (!parent) throw new InvalidReferenceError(`${fkField} does not reference an existing record`);
    return model.create({ data: { [fkField]: parentId }, ...readOpts });
  }
  function list(user) {
    const where = user?.role === ownerRole ? { [fkField]: user[fkField] || "__none__" } : {};
    return model.findMany({ where, orderBy: { createdAt: "desc" }, ...readOpts });
  }
  async function get(id) {
    const sheet = await model.findUnique({ where: { id }, ...readOpts });
    if (!sheet) throw new NotFoundError("Info sheet not found");
    return sheet;
  }
  async function getForUser(user, id) {
    const sheet = await get(id);
    if (user.role === ownerRole && sheet[fkField] !== user[fkField]) throw new NotFoundError("Info sheet not found");
    return sheet;
  }
  async function submit(user, id, data) {
    const sheet = await get(id);
    if (sheet[fkField] !== user[fkField]) throw new NotFoundError("Info sheet not found");
    // Submitting structured data clears any previously uploaded PDF.
    const extra = binaryField ? { [binaryField]: null } : {};
    const submittedByName = await resolveName(user);
    return model.update({ where: { id }, data: { data, ...extra, status: "SUBMITTED", submittedAt: new Date(), submittedByName, formVersion: version }, ...readOpts });
  }
  const EDITABLE = ["REQUESTED", "RETURNED"];
  function assertOwnerEditable(sheet, user) {
    if (sheet[fkField] !== user[fkField]) throw new NotFoundError("Info sheet not found");
    if (!EDITABLE.includes(sheet.status)) throw new ConflictError("This form can no longer be edited");
  }
  // Store/replace the applicant's working PDF without changing status.
  async function savePdf(user, id, buffer) {
    const sheet = await get(id);
    assertOwnerEditable(sheet, user);
    return model.update({ where: { id }, data: { [binaryField]: buffer }, ...readOpts });
  }
  // Store the finished PDF and mark the form submitted.
  async function submitPdf(user, id, buffer) {
    const sheet = await get(id);
    assertOwnerEditable(sheet, user);
    const submittedByName = await resolveName(user);
    return model.update({ where: { id }, data: { [binaryField]: buffer, status: "SUBMITTED", submittedAt: new Date(), submittedByName, formVersion: version }, ...readOpts });
  }
  // Fetch just the stored PDF (scoped to the requesting user); null if none.
  async function getBinary(user, id) {
    await getForUser(user, id);
    const row = await model.findUnique({ where: { id }, select: { [binaryField]: true } });
    return row?.[binaryField] || null;
  }
  async function review(actor, id, { status, remarks }) {
    const sheet = await get(id);
    if (status === "APPROVED" && approveGuard) await approveGuard(sheet[fkField]);
    const reviewedByName = await resolveName(actor);
    return model.update({ where: { id }, data: { status, remarks: remarks ?? null, reviewedAt: new Date(), reviewedByName }, ...readOpts });
  }
  return { createRequest, list, get, getForUser, submit, savePdf, submitPdf, getBinary, review };
}

// Build the shared route group for one sheet type. `pdfRenderer` supplies the
// filled-PDF layout (defaults to the generic label:value renderer), backing the
// live preview + staff download. `binaryField` enables the upload/edit-a-PDF
// path (store/submit/retrieve the applicant's own PDF).
export function makeInfoSheetRouter({ model, parentModel, fkField, ownerRole, relationName, config, submitSchema, title, filePrefix, pdfRenderer, binaryField, approveGuard = null }) {
  const service = makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField, version: config?.version || null, approveGuard });
  const render = pdfRenderer || streamInfoSheetPdf;
  const listRoles = [...STAFF, ownerRole];
  const r = Router();
  r.use(verifyJwt);

  r.get("/config", (req, res) => res.json(config));

  // Live preview: render the form from posted (unsaved, partial) data. Before "/:id".
  r.post("/preview", requireRole(...listRoles), (req, res, next) => {
    try {
      const data = (req.body && typeof req.body.data === "object" && req.body.data) || {};
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      render({ title, config, data }, res);
    } catch (e) { next(e); }
  });

  r.post("/", requireWrite, async (req, res, next) => {
    try { res.status(201).json(await service.createRequest(req.body?.[fkField])); } catch (e) { next(e); }
  });

  r.get("/", requireRole(...listRoles), async (req, res, next) => {
    try { res.json(await service.list(req.user)); } catch (e) { next(e); }
  });

  r.patch("/:id/submit", requireRole(ownerRole), async (req, res, next) => {
    try {
      const data = submitSchema.parse(req.body?.data ?? {});
      res.json(await service.submit(req.user, req.params.id, data));
    } catch (e) { next(e); }
  });

  if (binaryField) {
    const rawPdf = express.raw({ type: "application/pdf", limit: "20mb" });
    const requirePdf = (req) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError("A PDF body is required");
      if (req.body.slice(0, 5).toString() !== "%PDF-") throw new ValidationError("Body is not a valid PDF");
    };
    // Save the applicant's working PDF (status unchanged).
    r.patch("/:id/pdf", requireRole(ownerRole), rawPdf, async (req, res, next) => {
      try { requirePdf(req); res.json(await service.savePdf(req.user, req.params.id, req.body)); } catch (e) { next(e); }
    });
    // Submit the finished uploaded/edited PDF.
    r.patch("/:id/submit-pdf", requireRole(ownerRole), rawPdf, async (req, res, next) => {
      try { requirePdf(req); res.json(await service.submitPdf(req.user, req.params.id, req.body)); } catch (e) { next(e); }
    });
    // Download/view the stored PDF (owner: theirs; staff: any). 404 if none.
    r.get("/:id/filled-pdf", requireRole(...listRoles), async (req, res, next) => {
      try {
        const pdf = await service.getBinary(req.user, req.params.id);
        if (!pdf) throw new NotFoundError("No uploaded PDF for this form");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Disposition", `attachment; filename="${filePrefix}-${req.params.id}.pdf"`);
        res.send(pdf);
      } catch (e) { next(e); }
    });
  }

  r.patch("/:id/review", requireWrite, async (req, res, next) => {
    try {
      const { status, remarks } = reviewSchema.parse(req.body);
      res.json(await service.review(req.user, req.params.id, { status, remarks }));
    } catch (e) { next(e); }
  });

  r.get("/:id/pdf", requireRole(...listRoles), async (req, res, next) => {
    try {
      const sheet = await service.getForUser(req.user, req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename="${filePrefix}-${sheet.id}.pdf"`);
      render({ title, config, data: sheet.data || {} }, res);
    } catch (e) { next(e); }
  });

  r.get("/:id", requireRole(...listRoles), async (req, res, next) => {
    try { res.json(await service.getForUser(req.user, req.params.id)); } catch (e) { next(e); }
  });

  return r;
}
