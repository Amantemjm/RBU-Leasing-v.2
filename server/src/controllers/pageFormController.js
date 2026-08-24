import * as service from "../services/pageFormService.js";
import { pageFormSaveSchema, pageFormEntrySchema } from "../validation/pageForm.js";

// --- Admin (Super Admin only) ---
export async function list(req, res, next) {
  try { res.json(await service.listPageForms()); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getPageForm(req.params.role, req.params.pageKey)); } catch (e) { next(e); }
}
export async function save(req, res, next) {
  try {
    const data = pageFormSaveSchema.parse(req.body);
    res.json(await service.savePageForm(req.params.role, req.params.pageKey, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.deletePageForm(req.params.role, req.params.pageKey); res.status(204).end(); } catch (e) { next(e); }
}
export async function entries(req, res, next) {
  try { res.json(await service.listEntries(req.params.role, req.params.pageKey)); } catch (e) { next(e); }
}

// --- Runtime (the signed-in role user) ---
export async function getMine(req, res, next) {
  try { res.json(await service.getMine(req.user, req.params.pageKey)); } catch (e) { next(e); }
}
export async function saveMine(req, res, next) {
  try {
    const { data } = pageFormEntrySchema.parse(req.body);
    res.json(await service.saveMine(req.user, req.params.pageKey, data));
  } catch (e) { next(e); }
}
