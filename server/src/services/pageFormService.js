import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";
import { isValidSlot, pageFormSlot } from "../../../shared/pageForms.js";

function assertSlot(role, pageKey) {
  if (!isValidSlot(role, pageKey)) {
    throw new InvalidReferenceError(`${role} / ${pageKey} is not a configurable page slot`);
  }
}

// --- Admin: configure slots ------------------------------------------------

// Every configured slot, with a submission count, for the configurator landing.
export async function listPageForms() {
  const forms = await prisma.pageForm.findMany({
    orderBy: [{ role: "asc" }, { pageKey: "asc" }],
    include: { _count: { select: { entries: true } } },
  });
  return forms.map((f) => ({
    id: f.id,
    role: f.role,
    pageKey: f.pageKey,
    title: f.title,
    fields: f.fields,
    entryCount: f._count.entries,
    updatedAt: f.updatedAt,
  }));
}

export async function getPageForm(role, pageKey) {
  assertSlot(role, pageKey);
  return prisma.pageForm.findUnique({ where: { role_pageKey: { role, pageKey } } });
}

// Create or replace the field configuration for a slot.
export async function savePageForm(role, pageKey, { title, fields }) {
  assertSlot(role, pageKey);
  return prisma.pageForm.upsert({
    where: { role_pageKey: { role, pageKey } },
    create: { role, pageKey, title: title ?? null, fields },
    update: { title: title ?? null, fields },
  });
}

export async function deletePageForm(role, pageKey) {
  assertSlot(role, pageKey);
  const form = await prisma.pageForm.findUnique({ where: { role_pageKey: { role, pageKey } } });
  if (!form) throw new NotFoundError("This page has no configured form");
  await prisma.pageForm.delete({ where: { id: form.id } });
}

// Submissions for a slot, newest first, with the submitter's name.
export async function listEntries(role, pageKey) {
  assertSlot(role, pageKey);
  const form = await prisma.pageForm.findUnique({ where: { role_pageKey: { role, pageKey } } });
  if (!form) return [];
  const entries = await prisma.pageFormEntry.findMany({
    where: { pageFormId: form.id },
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return entries.map((e) => ({
    id: e.id,
    user: e.user,
    data: e.data,
    updatedAt: e.updatedAt,
  }));
}

// --- Runtime: the role user's own view -------------------------------------

// The configured fields for the current user's role + page, plus that user's
// saved answers (if any). Returns fields:[] when nothing is configured so the
// page can simply render nothing.
export async function getMine(user, pageKey) {
  const role = user.role;
  const slot = pageFormSlot(role, pageKey);
  if (!slot) return { pageKey, title: null, fields: [], data: null };

  const form = await prisma.pageForm.findUnique({ where: { role_pageKey: { role, pageKey } } });
  if (!form || !Array.isArray(form.fields) || form.fields.length === 0) {
    return { pageKey, title: slot.label, fields: [], data: null };
  }
  const entry = await prisma.pageFormEntry.findUnique({
    where: { pageFormId_userId: { pageFormId: form.id, userId: user.userId } },
  });
  return {
    pageKey,
    title: form.title || slot.label,
    fields: form.fields,
    data: entry?.data ?? null,
  };
}

// Upsert the current user's answers. Requires a configured form for the slot.
export async function saveMine(user, pageKey, data) {
  const role = user.role;
  assertSlot(role, pageKey);
  const form = await prisma.pageForm.findUnique({ where: { role_pageKey: { role, pageKey } } });
  if (!form || !Array.isArray(form.fields) || form.fields.length === 0) {
    throw new NotFoundError("This page has no form to submit");
  }
  const entry = await prisma.pageFormEntry.upsert({
    where: { pageFormId_userId: { pageFormId: form.id, userId: user.userId } },
    create: { pageFormId: form.id, userId: user.userId, data },
    update: { data },
  });
  return { data: entry.data, updatedAt: entry.updatedAt };
}
