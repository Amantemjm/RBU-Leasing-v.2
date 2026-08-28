import * as service from "../services/lessorRequirementService.js";
import { reviewSchema } from "../validation/lessorRequirement.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

export async function listMine(req, res, next) {
  try { res.json(await service.listForOwner(req.user.unitOwnerId)); } catch (e) { next(e); }
}
export async function listForOwner(req, res, next) {
  try { res.json(await service.listForOwner(req.params.unitOwnerId)); } catch (e) { next(e); }
}
export async function uploadMine(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    res.status(201).json(await service.uploadRequirement(req.user.unitOwnerId, req.params.key, req.file));
  } catch (e) { next(e); }
}
export async function uploadForOwner(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    res.status(201).json(await service.uploadRequirement(req.params.unitOwnerId, req.params.key, req.file));
  } catch (e) { next(e); }
}
export async function review(req, res, next) {
  try {
    const data = reviewSchema.parse(req.body);
    res.json(await service.reviewRequirement(req.user, req.params.id, data));
  } catch (e) { next(e); }
}
export async function download(req, res, next) {
  try {
    const row = await service.getForDownload(req.params.id);
    if (req.user.role === "UNIT_OWNER" && row.unitOwnerId !== req.user.unitOwnerId) throw new NotFoundError("Document not found");
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${row.filename}"`);
    res.send(Buffer.from(row.data));
  } catch (e) { next(e); }
}
