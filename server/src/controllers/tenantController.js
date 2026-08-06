import * as service from "../services/tenantService.js";
import { tenantCreateSchema, tenantUpdateSchema } from "../validation/tenant.js";

export async function list(req, res, next) {
  try { res.json(await service.listTenants()); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getTenant(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = tenantCreateSchema.parse(req.body);
    res.status(201).json(await service.createTenant(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = tenantUpdateSchema.parse(req.body);
    res.json(await service.updateTenant(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeTenant(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
