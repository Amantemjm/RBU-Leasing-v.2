import * as service from "../services/lesseeRequirementService.js";
import { lesseeReviewSchema } from "../validation/lesseeRequirement.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

export async function listMine(req, res, next) {
  try { res.json(await service.listForTenant(req.user.tenantId)); } catch (e) { next(e); }
}
export async function listForTenant(req, res, next) {
  try { res.json(await service.listForTenant(req.params.tenantId)); } catch (e) { next(e); }
}
export async function uploadMine(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    res.status(201).json(await service.uploadRequirement(req.user.tenantId, req.params.key, req.file));
  } catch (e) { next(e); }
}
export async function uploadForTenant(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    res.status(201).json(await service.uploadRequirement(req.params.tenantId, req.params.key, req.file));
  } catch (e) { next(e); }
}
export async function review(req, res, next) {
  try {
    const data = lesseeReviewSchema.parse(req.body);
    res.json(await service.reviewRequirement(req.user, req.params.id, data));
  } catch (e) { next(e); }
}
export async function download(req, res, next) {
  try {
    const row = await service.getForDownload(req.params.id);
    // A lessee may only ever pull their own file.
    if (req.user.role === "TENANT" && row.tenantId !== req.user.tenantId) {
      throw new NotFoundError("Document not found");
    }
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${row.filename}"`);
    res.send(Buffer.from(row.data));
  } catch (e) { next(e); }
}
