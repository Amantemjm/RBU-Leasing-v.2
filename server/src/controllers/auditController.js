import * as service from "../services/auditService.js";

export async function list(req, res, next) {
  try { res.json(await service.listAudit({ limit: req.query.limit })); } catch (e) { next(e); }
}
