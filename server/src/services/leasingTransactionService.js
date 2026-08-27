import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError, ConflictError } from "../lib/errors.js";
import {
  LEASING_STAGES, STAGE_KEYS, stageByKey, stageIndex, nextStageKey, prevStageKey, isValidStatus, isFinalStage,
  APPROVAL_ROUTING, APPROVAL_STEP_STATUSES,
} from "../../../shared/leasingStages.js";

const includeFull = {
  unit: { select: { id: true, unitNumber: true, building: true } },
  tenant: { select: { id: true, name: true } },
  unitOwner: { select: { id: true, name: true } },
  assignedOfficer: { select: { id: true, name: true, email: true } },
  inquiry: { select: { id: true, fullName: true, email: true, inquirerType: true, category: true, inquiryType: true } },
  // metadata only — never ship the binary `data` in list/detail payloads
  documents: {
    select: { id: true, filename: true, mimeType: true, size: true, stage: true, uploadedByName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  },
  approvalSteps: { orderBy: { order: "asc" } },
};

// --- helpers ---------------------------------------------------------------

async function nextReference() {
  const year = new Date().getFullYear();
  const prefix = `RBU-${year}-`;
  const count = await prisma.leasingTransaction.count({ where: { reference: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

async function logEvent(transactionId, actor, message, stage) {
  let actorName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    actorName = u?.name || u?.email || null;
  }
  await prisma.transactionEvent.create({
    data: {
      transactionId,
      actorId: actor?.userId || null,
      actorName,
      actorRole: actor?.role || null,
      stage: stage || null,
      message,
    },
  });
}

function stampNow() {
  return new Date().toISOString();
}

// --- auto-create when an inquiry is accepted -------------------------------

// Creates the transaction for an accepted inquiry (idempotent). Inquiry and
// Accept-Inquiry stages are marked complete; the flow rests at Unit Registration.
export async function ensureForInquiry(inquiry, actor) {
  const existing = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inquiry.id } });
  if (existing) return existing;

  const now = stampNow();
  const reference = await nextReference();
  const stageData = {
    INQUIRY: { status: "Qualified", completedAt: now },
    SEND_REQUIREMENTS: { status: "Pending", startedAt: now },
  };
  const txn = await prisma.leasingTransaction.create({
    data: {
      reference,
      stage: "SEND_REQUIREMENTS",
      status: "Pending",
      stageData,
      lesseeName: inquiry.fullName,
      inquiryId: inquiry.id,
      assignedOfficerId: inquiry.assignedToId || actor?.userId || null,
    },
  });
  await logEvent(txn.id, actor, `Inquiry accepted — transaction ${reference} created`, "INQUIRY");
  return txn;
}

// --- listing / reading -----------------------------------------------------

// Staff view. ADMIN/VIEWER see all; an O-Lease sees their own + unassigned.
export function listTransactions(user) {
  const where = user?.role === "LEASING_OFFICER"
    ? { OR: [{ assignedOfficerId: user.userId }, { assignedOfficerId: null }] }
    : {};
  return prisma.leasingTransaction.findMany({
    where, orderBy: { updatedAt: "desc" }, include: includeFull,
  });
}

// Portal view — the transactions belonging to the signed-in lessee/lessor.
export function listMine(user) {
  let where = null;
  if (user?.role === "TENANT" && user.tenantId) where = { tenantId: user.tenantId };
  else if (user?.role === "UNIT_OWNER" && user.unitOwnerId) where = { unitOwnerId: user.unitOwnerId };
  if (!where) return Promise.resolve([]);
  return prisma.leasingTransaction.findMany({ where, orderBy: { updatedAt: "desc" }, include: includeFull });
}

export async function getTransaction(id) {
  const txn = await prisma.leasingTransaction.findUnique({
    where: { id },
    include: { ...includeFull, events: { orderBy: { createdAt: "desc" } } },
  });
  if (!txn) throw new NotFoundError("Transaction not found");
  return txn;
}

// A portal user may only read their own transaction.
export async function getMineTransaction(user, id) {
  const txn = await getTransaction(id);
  const ownsTenant = user.role === "TENANT" && txn.tenantId && txn.tenantId === user.tenantId;
  const ownsOwner = user.role === "UNIT_OWNER" && txn.unitOwnerId && txn.unitOwnerId === user.unitOwnerId;
  if (!ownsTenant && !ownsOwner) throw new NotFoundError("Transaction not found");
  return txn;
}

// --- mutations -------------------------------------------------------------

export async function createTransaction(actor, data) {
  const reference = await nextReference();
  const startKey = data.startStage && STAGE_KEYS.includes(data.startStage)
    ? data.startStage : LEASING_STAGES[0].key;
  const startIdx = stageIndex(startKey);
  const startCfg = stageByKey(startKey);
  const now = stampNow();

  const stageData = {};
  for (let i = 0; i < startIdx; i++) {
    stageData[STAGE_KEYS[i]] = { status: "Skipped", completedAt: now };
  }
  stageData[startKey] = { status: startCfg.initial, startedAt: now };

  const txn = await prisma.leasingTransaction.create({
    data: {
      reference,
      stage: startKey,
      status: startCfg.initial,
      stageData,
      lesseeName: data.lesseeName || null,
      unitId: data.unitId || null,
      tenantId: data.tenantId || null,
      unitOwnerId: data.unitOwnerId || null,
      assignedOfficerId: data.assignedOfficerId || actor?.userId || null,
    },
  });
  if (startKey === "APPROVAL") await ensureApprovalSteps(txn.id);
  await logEvent(txn.id, actor, `Transaction ${reference} created`, startKey);
  return getTransaction(txn.id);
}

async function loadOrThrow(id) {
  const txn = await prisma.leasingTransaction.findUnique({ where: { id } });
  if (!txn) throw new NotFoundError("Transaction not found");
  return txn;
}

// Set the status within the current stage (with optional remarks).
export async function setStatus(actor, id, { status, remarks }) {
  const txn = await loadOrThrow(id);
  if (!isValidStatus(txn.stage, status)) {
    throw new InvalidReferenceError(`"${status}" is not a valid status for this stage`);
  }
  const stageData = { ...(txn.stageData || {}) };
  stageData[txn.stage] = { ...(stageData[txn.stage] || {}), status, remarks: remarks ?? stageData[txn.stage]?.remarks ?? "" };
  const patch = { status, stageData };
  if (isFinalStage(txn.stage)) patch.finalStatus = status;

  await prisma.leasingTransaction.update({ where: { id }, data: patch });
  await logEvent(id, actor, `${stageByKey(txn.stage).label} status set to "${status}"${remarks ? ` — ${remarks}` : ""}`, txn.stage);
  return getTransaction(id);
}

// Advance to the next stage. Records the current stage as completed.
export async function advance(actor, id, { status, remarks } = {}) {
  const txn = await loadOrThrow(id);
  const next = nextStageKey(txn.stage);
  if (!next) throw new ConflictError("The transaction is already at the final stage");

  const now = stampNow();
  const stageData = { ...(txn.stageData || {}) };
  stageData[txn.stage] = { ...(stageData[txn.stage] || {}), status: txn.status, completedAt: now };
  const nextCfg = stageByKey(next);
  const nextStatus = status && isValidStatus(next, status) ? status : nextCfg.initial;
  stageData[next] = { ...(stageData[next] || {}), status: nextStatus, startedAt: now, remarks: remarks || stageData[next]?.remarks || "" };

  const patch = { stage: next, status: nextStatus, stageData };
  if (isFinalStage(next)) patch.finalStatus = nextStatus;

  await prisma.leasingTransaction.update({ where: { id }, data: patch });
  if (next === "APPROVAL") await ensureApprovalSteps(id);
  await logEvent(id, actor, `Advanced to ${nextCfg.label}${remarks ? ` — ${remarks}` : ""}`, next);
  return getTransaction(id);
}

// Send the transaction back one stage (exception / return flow).
export async function returnStage(actor, id, { status, remarks } = {}) {
  const txn = await loadOrThrow(id);
  const prev = prevStageKey(txn.stage);
  if (!prev) throw new ConflictError("The transaction is already at the first stage");

  const prevCfg = stageByKey(prev);
  const stageData = { ...(txn.stageData || {}) };
  // Reopen the previous stage.
  const prevStatus = status && isValidStatus(prev, status)
    ? status
    : (prevCfg.statuses.includes("For Revision") ? "For Revision" : prevCfg.initial);
  const { completedAt, ...prevKept } = stageData[prev] || {};
  stageData[prev] = { ...prevKept, status: prevStatus, remarks: remarks || "" };
  // Drop the (now abandoned) current stage progress marker.
  if (stageData[txn.stage]) delete stageData[txn.stage].completedAt;

  await prisma.leasingTransaction.update({
    where: { id }, data: { stage: prev, status: prevStatus, finalStatus: null, stageData },
  });
  await logEvent(id, actor, `Returned to ${prevCfg.label}${remarks ? ` — ${remarks}` : ""}`, prev);
  return getTransaction(id);
}

// Link related records (used mainly at Unit Registration).
export async function linkRecords(actor, id, { unitId, tenantId, unitOwnerId }) {
  await loadOrThrow(id);
  const data = {};
  const notes = [];
  if (unitId !== undefined) {
    if (unitId) {
      const unit = await prisma.unit.findUnique({ where: { id: unitId } });
      if (!unit) throw new InvalidReferenceError("unitId does not reference a unit");
      notes.push(`unit ${unit.unitNumber}`);
    }
    data.unitId = unitId || null;
  }
  if (tenantId !== undefined) {
    if (tenantId) {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!t) throw new InvalidReferenceError("tenantId does not reference a tenant");
      notes.push(`lessee ${t.name}`);
    }
    data.tenantId = tenantId || null;
  }
  if (unitOwnerId !== undefined) {
    if (unitOwnerId) {
      const o = await prisma.unitOwner.findUnique({ where: { id: unitOwnerId } });
      if (!o) throw new InvalidReferenceError("unitOwnerId does not reference an owner");
      notes.push(`lessor ${o.name}`);
    }
    data.unitOwnerId = unitOwnerId || null;
  }
  await prisma.leasingTransaction.update({ where: { id }, data });
  if (notes.length) await logEvent(id, actor, `Linked ${notes.join(", ")}`);
  return getTransaction(id);
}

export async function deleteTransaction(id) {
  await loadOrThrow(id);
  await prisma.leasingTransaction.delete({ where: { id } });
}

// --- access control (shared by document + step endpoints) ------------------

const STAFF_ROLES = ["ADMIN", "LEASING_OFFICER", "VIEWER"];

// A staff member, or the linked lessee/lessor, may see a transaction's docs.
export async function assertCanAccess(user, id) {
  const txn = await loadOrThrow(id);
  if (STAFF_ROLES.includes(user.role)) return txn;
  if (user.role === "TENANT" && txn.tenantId && txn.tenantId === user.tenantId) return txn;
  if (user.role === "UNIT_OWNER" && txn.unitOwnerId && txn.unitOwnerId === user.unitOwnerId) return txn;
  throw new NotFoundError("Transaction not found");
}

// --- supporting documents --------------------------------------------------

export async function addDocument(actor, id, file) {
  const txn = await assertCanAccess(actor, id);
  let uploadedByName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    uploadedByName = u?.name || u?.email || null;
  }
  const doc = await prisma.transactionDocument.create({
    data: {
      transactionId: id,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      data: file.buffer,
      stage: txn.stage,
      uploadedById: actor?.userId || null,
      uploadedByName,
    },
    select: { id: true, filename: true, mimeType: true, size: true, stage: true, uploadedByName: true, createdAt: true },
  });
  await logEvent(id, actor, `Uploaded document "${file.originalname}"`, txn.stage);
  return doc;
}

export async function getDocumentForDownload(user, id, docId) {
  await assertCanAccess(user, id);
  const doc = await prisma.transactionDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.transactionId !== id) throw new NotFoundError("Document not found");
  return doc;
}

export async function deleteDocument(user, id, docId) {
  await assertCanAccess(user, id);
  const doc = await prisma.transactionDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.transactionId !== id) throw new NotFoundError("Document not found");
  // Only staff or the original uploader may delete.
  if (!STAFF_ROLES.includes(user.role) && doc.uploadedById !== user.userId) {
    throw new ConflictError("You can only delete a document you uploaded");
  }
  await prisma.transactionDocument.delete({ where: { id: docId } });
  await logEvent(id, user, `Removed document "${doc.filename}"`);
}

// --- approval routing ------------------------------------------------------

// Create the routing chain for a transaction if it doesn't have one yet.
export async function ensureApprovalSteps(id) {
  const count = await prisma.approvalStep.count({ where: { transactionId: id } });
  if (count > 0) return;
  await prisma.approvalStep.createMany({
    data: APPROVAL_ROUTING.map((name, i) => ({ transactionId: id, order: i, name, status: "Pending" })),
  });
}

export async function listApprovalSteps(user, id) {
  await assertCanAccess(user, id);
  await ensureApprovalSteps(id);
  return prisma.approvalStep.findMany({ where: { transactionId: id }, orderBy: { order: "asc" } });
}

// Recompute the Approval-stage status from the routing steps.
function approvalStatusFrom(steps) {
  if (steps.some((s) => s.status === "Rejected")) return "Rejected";
  if (steps.some((s) => s.status === "Returned")) return "For Revision";
  if (steps.length && steps.every((s) => s.status === "Approved")) return "Approved";
  if (steps.some((s) => s.status === "Approved")) return "Under Review";
  return "Submitted";
}

export async function decideApprovalStep(actor, id, stepId, { status, remarks }) {
  await loadOrThrow(id);
  if (!APPROVAL_STEP_STATUSES.includes(status)) {
    throw new InvalidReferenceError(`"${status}" is not a valid approval decision`);
  }
  await ensureApprovalSteps(id);
  const steps = await prisma.approvalStep.findMany({ where: { transactionId: id }, orderBy: { order: "asc" } });
  const step = steps.find((s) => s.id === stepId);
  if (!step) throw new NotFoundError("Approval step not found");
  // Sequential routing: every earlier step must already be Approved.
  const earlier = steps.filter((s) => s.order < step.order);
  if (status === "Approved" && earlier.some((s) => s.status !== "Approved")) {
    throw new ConflictError("Earlier approval steps must be approved first");
  }

  let approverName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    approverName = u?.name || u?.email || null;
  }
  await prisma.approvalStep.update({
    where: { id: stepId },
    data: { status, remarks: remarks ?? null, approverId: actor?.userId || null, approverName, decidedAt: new Date() },
  });

  const updated = await prisma.approvalStep.findMany({ where: { transactionId: id }, orderBy: { order: "asc" } });
  const txn = await loadOrThrow(id);
  // Reflect routing progress onto the Approval-stage status.
  if (txn.stage === "APPROVAL") {
    const newStatus = approvalStatusFrom(updated);
    const stageData = { ...(txn.stageData || {}) };
    stageData.APPROVAL = { ...(stageData.APPROVAL || {}), status: newStatus };
    await prisma.leasingTransaction.update({ where: { id }, data: { status: newStatus, stageData } });
  }
  await logEvent(id, actor, `${step.name} approval: ${status}${remarks ? ` — ${remarks}` : ""}`, "APPROVAL");
  return getTransaction(id);
}
