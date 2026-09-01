import * as svc from "../services/unitListingService.js";
export async function list(req, res, next) {
  try { res.json(await svc.listPublic({ estateId: req.query.estateId, type: req.query.type })); } catch (e) { next(e); }
}
export async function detail(req, res, next) {
  try { res.json(await svc.getPublic(req.params.unitId)); } catch (e) { next(e); }
}
export async function photo(req, res, next) {
  try {
    const row = await svc.getPhotoBytes(req.params.photoId, { requirePublished: true });
    res.setHeader("Content-Type", row.mimeType); res.setHeader("Cache-Control", "public, max-age=300"); res.send(row.data);
  } catch (e) { next(e); }
}
