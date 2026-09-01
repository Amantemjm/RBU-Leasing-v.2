import * as svc from "../services/unitListingService.js";
import { updateListingSchema } from "../validation/unitListing.js";

export async function get(req, res, next) {
  try { res.json(await svc.getForUnit(req.params.unitId)); } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try { res.json(await svc.updateListing(req.user, req.params.unitId, updateListingSchema.parse(req.body))); } catch (e) { next(e); }
}
