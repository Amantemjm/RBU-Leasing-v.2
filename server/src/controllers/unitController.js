import * as service from "../services/unitService.js";
import { unitCreateSchema, unitUpdateSchema } from "../validation/unit.js";

export async function list(req, res, next) {
  try {
    const { ownerId, status } = req.query;
    res.json(await service.listUnits({ ownerId, status }));
  } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getUnit(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = unitCreateSchema.parse(req.body);
    res.status(201).json(await service.createUnit(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = unitUpdateSchema.parse(req.body);
    res.json(await service.updateUnit(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeUnit(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
