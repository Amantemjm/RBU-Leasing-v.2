import * as service from "../services/inquiryService.js";
import { inquiryCreateSchema, inquiryUpdateSchema, inquiryAssignSchema } from "../validation/inquiry.js";

export async function create(req, res, next) {
  try {
    const data = inquiryCreateSchema.parse(req.body);
    res.status(201).json(await service.createInquiry(data));
  } catch (e) { next(e); }
}
export async function list(req, res, next) {
  try { res.json(await service.listInquiries(req.user)); } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const { status } = inquiryUpdateSchema.parse(req.body);
    res.json(await service.updateInquiryStatus(req.params.id, status));
  } catch (e) { next(e); }
}
export async function assign(req, res, next) {
  try {
    const { assignedToId } = inquiryAssignSchema.parse(req.body);
    res.json(await service.assignInquiry(req.params.id, assignedToId));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.deleteInquiry(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
