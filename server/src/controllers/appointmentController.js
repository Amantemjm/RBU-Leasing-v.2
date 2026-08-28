import * as svc from "../services/appointmentService.js";
import { scheduleSchema } from "../validation/appointment.js";

export async function mine(req, res, next) {
  try { res.json(await svc.listMine(req.user)); } catch (e) { next(e); }
}
export async function forTransaction(req, res, next) {
  try { res.json(await svc.listForTransaction(req.user, req.params.txnId)); } catch (e) { next(e); }
}
export async function schedule(req, res, next) {
  try {
    const body = scheduleSchema.parse(req.body);
    res.status(201).json(await svc.scheduleAppointment(req.user, req.params.txnId, req.params.stage, body));
  } catch (e) { next(e); }
}
