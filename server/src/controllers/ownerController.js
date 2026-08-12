import * as service from "../services/ownerService.js";
import { ownerCreateSchema, ownerUpdateSchema } from "../validation/owner.js";

export async function list(req, res, next) {
  try { res.json(await service.listOwners()); } catch (e) { next(e); }
}
export async function me(req, res, next) {
  try { res.json(await service.getOwnerMe(req.user)); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getOwner(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = ownerCreateSchema.parse(req.body);
    res.status(201).json(await service.createOwner(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = ownerUpdateSchema.parse(req.body);
    res.json(await service.updateOwner(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeOwner(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
