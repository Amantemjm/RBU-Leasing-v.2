import * as service from "../services/cmsFormService.js";
import { cmsFormCreateSchema, cmsFormUpdateSchema } from "../validation/cmsForm.js";

export async function list(req, res, next) {
  try { res.json(await service.listCmsForms()); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getCmsForm(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = cmsFormCreateSchema.parse(req.body);
    res.status(201).json(await service.createCmsForm(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = cmsFormUpdateSchema.parse(req.body);
    res.json(await service.updateCmsForm(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.deleteCmsForm(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
