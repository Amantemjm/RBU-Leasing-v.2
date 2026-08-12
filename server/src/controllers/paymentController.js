import * as service from "../services/paymentService.js";
import { paymentCreateSchema, paymentUpdateSchema } from "../validation/payment.js";

export async function list(req, res, next) {
  try {
    const { leaseId, status } = req.query;
    res.json(await service.listPaymentsForUser(req.user, { leaseId, status }));
  } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getPaymentForUser(req.user, req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = paymentCreateSchema.parse(req.body);
    res.status(201).json(await service.createPayment(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = paymentUpdateSchema.parse(req.body);
    res.json(await service.updatePayment(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removePayment(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
