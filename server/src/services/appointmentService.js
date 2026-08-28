import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError, ConflictError } from "../lib/errors.js";
import {
  SCHEDULABLE_STAGES, isSchedulableStage, stageByKey, stageIndex, isFinalStage,
} from "../../../shared/leasingStages.js";
import { assertCanAccess } from "./leasingTransactionService.js";

async function resolveName(user) {
  if (user?.userId) {
    const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, email: true } });
    if (u) return u.name || u.email || null;
  }
  return null;
}
async function logEvent(transactionId, actor, message, stage) {
  await prisma.transactionEvent.create({
    data: { transactionId, actorId: actor?.userId || null, actorName: await resolveName(actor), actorRole: actor?.role || null, stage: stage || null, message },
  });
}
// Write a stage's status into the transaction: always stageData[stage].status;
// top-level status only when it is the current stage.
async function syncStageStatus(txn, stage, status) {
  const stageData = { ...(txn.stageData || {}) };
  stageData[stage] = { ...(stageData[stage] || {}), status };
  const patch = { stageData };
  if (stage === txn.stage) { patch.status = status; if (isFinalStage(stage)) patch.finalStatus = status; }
  await prisma.leasingTransaction.update({ where: { id: txn.id }, data: patch });
}

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];

export async function listForTransaction(user, txnId) {
  await assertCanAccess(user, txnId); // 404 if not staff/owner/tenant
  return prisma.appointment.findMany({ where: { transactionId: txnId }, orderBy: { stage: "asc" } });
}
export async function listMine(user) {
  let where = null;
  if (user?.role === "TENANT" && user.tenantId) where = { transaction: { tenantId: user.tenantId } };
  else if (user?.role === "UNIT_OWNER" && user.unitOwnerId) where = { transaction: { unitOwnerId: user.unitOwnerId } };
  if (!where) return [];
  return prisma.appointment.findMany({
    where, orderBy: { scheduledAt: "asc" },
    include: { transaction: { select: { id: true, reference: true } } },
  });
}
export async function scheduleAppointment(user, txnId, stage, body) {
  if (!isSchedulableStage(stage)) throw new InvalidReferenceError(`"${stage}" is not a schedulable stage`);
  const txn = await prisma.leasingTransaction.findUnique({ where: { id: txnId } });
  if (!txn) throw new NotFoundError("Transaction not found");
  // Cannot schedule a stage the transaction has already moved past.
  if (stageIndex(stage) < stageIndex(txn.stage) && (txn.stageData?.[stage]?.completedAt)) {
    throw new ConflictError("That stage is already completed");
  }
  const appt = await prisma.appointment.upsert({
    where: { transactionId_stage: { transactionId: txnId, stage } },
    create: {
      transactionId: txnId, stage, status: "Scheduled",
      scheduledAt: new Date(body.scheduledAt), location: body.location ?? null, notes: body.notes ?? null,
      createdById: user?.userId || null, createdByName: await resolveName(user),
    },
    update: { status: "Scheduled", scheduledAt: new Date(body.scheduledAt), location: body.location ?? null, notes: body.notes ?? null },
  });
  await syncStageStatus(txn, stage, "Scheduled");
  await logEvent(txnId, user, `${stageByKey(stage).label} scheduled for ${new Date(body.scheduledAt).toISOString()}`, stage);
  return appt;
}
