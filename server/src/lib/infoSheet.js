import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { NotFoundError, InvalidReferenceError } from "./errors.js";
import { verifyJwt, requireWrite, requireRole } from "../middleware/auth.js";
import { streamInfoSheetPdf } from "./infoSheetPdf.js";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const reviewSchema = z.object({
  status: z.enum(["APPROVED", "RETURNED"]),
  remarks: z.string().optional(),
});

// A generic info-sheet service parameterised by the sheet's Prisma model, its
// parent (UnitOwner/Tenant), the FK field, the owner role, and the relation to
// include for the staff table.
export function makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName }) {
  const include = { [relationName]: { select: { id: true, name: true } } };

  async function createRequest(parentId) {
    if (!parentId) throw new InvalidReferenceError(`${fkField} is required`);
    const parent = await parentModel.findUnique({ where: { id: parentId } });
    if (!parent) throw new InvalidReferenceError(`${fkField} does not reference an existing record`);
    return model.create({ data: { [fkField]: parentId }, include });
  }
  function list(user) {
    const where = user?.role === ownerRole ? { [fkField]: user[fkField] || "__none__" } : {};
    return model.findMany({ where, orderBy: { createdAt: "desc" }, include });
  }
  async function get(id) {
    const sheet = await model.findUnique({ where: { id }, include });
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
    return model.update({ where: { id }, data: { data, status: "SUBMITTED", submittedAt: new Date() }, include });
  }
  async function review(id, { status, remarks }) {
    await get(id);
    return model.update({ where: { id }, data: { status, remarks: remarks ?? null, reviewedAt: new Date() }, include });
  }
  return { createRequest, list, get, getForUser, submit, review };
}

// Build the shared route group for one sheet type.
export function makeInfoSheetRouter({ model, parentModel, fkField, ownerRole, relationName, config, submitSchema, title, filePrefix }) {
  const service = makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName });
  const listRoles = [...STAFF, ownerRole];
  const r = Router();
  r.use(verifyJwt);

  r.get("/config", (req, res) => res.json(config));

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

  r.patch("/:id/review", requireWrite, async (req, res, next) => {
    try {
      const { status, remarks } = reviewSchema.parse(req.body);
      res.json(await service.review(req.params.id, { status, remarks }));
    } catch (e) { next(e); }
  });

  r.get("/:id/pdf", requireRole(...listRoles), async (req, res, next) => {
    try {
      const sheet = await service.getForUser(req.user, req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filePrefix}-${sheet.id}.pdf"`);
      streamInfoSheetPdf({ title, config, data: sheet.data || {} }, res);
    } catch (e) { next(e); }
  });

  r.get("/:id", requireRole(...listRoles), async (req, res, next) => {
    try { res.json(await service.getForUser(req.user, req.params.id)); } catch (e) { next(e); }
  });

  return r;
}
