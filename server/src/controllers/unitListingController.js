import * as svc from "../services/unitListingService.js";
import { updateListingSchema, reorderSchema, captionSchema, coverSchema } from "../validation/unitListing.js";

export async function get(req, res, next) {
  try { res.json(await svc.getForUnit(req.params.unitId)); } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try { res.json(await svc.updateListing(req.user, req.params.unitId, updateListingSchema.parse(req.body))); } catch (e) { next(e); }
}
export async function addPhoto(req, res, next) {
  try { res.status(201).json(await svc.addPhoto(req.user, req.params.unitId, req.file)); } catch (e) { next(e); }
}
export async function deletePhoto(req, res, next) {
  try { res.json(await svc.deletePhoto(req.user, req.params.unitId, req.params.photoId)); } catch (e) { next(e); }
}
export async function reorderPhotos(req, res, next) {
  try { res.json(await svc.reorderPhotos(req.user, req.params.unitId, reorderSchema.parse(req.body).orderedIds)); } catch (e) { next(e); }
}
export async function captionPhoto(req, res, next) {
  try { res.json(await svc.updatePhotoCaption(req.user, req.params.unitId, req.params.photoId, captionSchema.parse(req.body).caption)); } catch (e) { next(e); }
}
export async function setCover(req, res, next) {
  try { res.json(await svc.setCover(req.user, req.params.unitId, coverSchema.parse(req.body).photoId)); } catch (e) { next(e); }
}
export async function staffImage(req, res, next) {
  try {
    const row = await svc.getPhotoForStaff(req.params.unitId, req.params.photoId);
    res.setHeader("Content-Type", row.mimeType); res.setHeader("Cache-Control", "no-store"); res.send(row.data);
  } catch (e) { next(e); }
}
export async function publish(req, res, next) {
  try { res.json(await svc.publish(req.user, req.params.unitId)); } catch (e) { next(e); }
}
export async function unpublish(req, res, next) {
  try { res.json(await svc.unpublish(req.user, req.params.unitId)); } catch (e) { next(e); }
}
