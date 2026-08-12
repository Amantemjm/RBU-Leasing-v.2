import * as service from "../services/leaseService.js";
import { leaseCreateSchema, leaseUpdateSchema } from "../validation/lease.js";

export async function list(req, res, next) {
  try {
    const { unitId, tenantId, status } = req.query;
    res.json(await service.listLeasesForUser(req.user, { unitId, tenantId, status }));
  } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getLeaseForUser(req.user, req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = leaseCreateSchema.parse(req.body);
    res.status(201).json(await service.createLease(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = leaseUpdateSchema.parse(req.body);
    res.json(await service.updateLease(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeLease(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
