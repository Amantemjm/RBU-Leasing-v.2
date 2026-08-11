import * as service from "../services/estateService.js";

export async function listEstates(req, res, next) {
  try { res.json(await service.listEstates()); } catch (e) { next(e); }
}

export async function listTowers(req, res, next) {
  try {
    const { estateId } = req.query;
    res.json(await service.listTowers({ estateId }));
  } catch (e) { next(e); }
}
