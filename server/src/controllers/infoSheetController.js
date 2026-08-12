import * as service from "../services/infoSheetService.js";
import { infoSheetCreateSchema, infoSheetSubmitSchema, infoSheetReviewSchema } from "../validation/infoSheet.js";

export async function create(req, res, next) {
  try {
    const data = infoSheetCreateSchema.parse(req.body);
    res.status(201).json(await service.createRequest(data));
  } catch (e) { next(e); }
}
export async function list(req, res, next) {
  try { res.json(await service.listSheets(req.user)); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getSheetForUser(req.user, req.params.id)); } catch (e) { next(e); }
}
export async function submit(req, res, next) {
  try {
    const data = infoSheetSubmitSchema.parse(req.body);
    res.json(await service.submitSheet(req.user, req.params.id, data));
  } catch (e) { next(e); }
}
export async function review(req, res, next) {
  try {
    const data = infoSheetReviewSchema.parse(req.body);
    res.json(await service.reviewSheet(req.params.id, data));
  } catch (e) { next(e); }
}
