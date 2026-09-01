import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError, ConflictError } from "../lib/errors.js";
import { UNIT_LISTING_FIELDS, DEFAULT_VISIBLE_FIELDS, isListingFieldKey } from "../../../shared/unitListingFields.js";

const PHOTO_META = { id: true, mimeType: true, size: true, caption: true, sortOrder: true, createdByName: true, createdAt: true };

async function resolveName(user) {
  if (user?.userId) {
    const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, email: true } });
    if (u) return u.name || u.email || null;
  }
  return null;
}
async function loadUnit(unitId) {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: { tower: { select: { name: true, estate: { select: { id: true, name: true } } } } },
  });
  if (!unit) throw new NotFoundError("Unit not found");
  return unit;
}
function defaultDetails(unit) {
  const d = {};
  for (const f of UNIT_LISTING_FIELDS) {
    if (f.fromUnit && unit[f.fromUnit] != null) d[f.key] = f.type === "number" ? Number(unit[f.fromUnit]) : String(unit[f.fromUnit]);
  }
  if (!d.location) d.location = [unit.tower?.name, unit.tower?.estate?.name].filter(Boolean).join(", ") || null;
  return d;
}
function unitCore(unit) {
  return { id: unit.id, unitNumber: unit.unitNumber, building: unit.building, type: unit.type,
    status: unit.status, approvalStatus: unit.approvalStatus,
    towerName: unit.tower?.name || null, estate: unit.tower?.estate || null };
}

export async function getForUnit(unitId) {
  const unit = await loadUnit(unitId);
  const listing = await prisma.unitListing.findUnique({ where: { unitId } });
  const photos = await prisma.unitPhoto.findMany({ where: { unitId }, orderBy: { sortOrder: "asc" }, select: PHOTO_META });
  const effective = listing || {
    unitId, published: false, publishedAt: null, headline: null,
    details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS, coverPhotoId: null,
  };
  return { unit: unitCore(unit), listing: effective, photos };
}

export async function updateListing(user, unitId, { details, visibleFields, headline }) {
  const unit = await loadUnit(unitId);
  if (details) for (const k of Object.keys(details)) if (!isListingFieldKey(k)) throw new InvalidReferenceError(`Unknown detail field "${k}"`);
  if (visibleFields) for (const k of visibleFields) if (!isListingFieldKey(k)) throw new InvalidReferenceError(`Unknown field "${k}"`);
  const existing = await prisma.unitListing.findUnique({ where: { unitId } });
  const data = {
    details: details ?? existing?.details ?? defaultDetails(unit),
    visibleFields: visibleFields ?? existing?.visibleFields ?? DEFAULT_VISIBLE_FIELDS,
    headline: headline !== undefined ? headline : existing?.headline ?? null,
  };
  const listing = await prisma.unitListing.upsert({ where: { unitId }, create: { unitId, ...data }, update: data });
  return getForUnit(unitId);
}

async function assertPhotoInUnit(unitId, photoId) {
  const photo = await prisma.unitPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.unitId !== unitId) throw new NotFoundError("Photo not found");
  return photo;
}

export async function addPhoto(user, unitId, file) {
  await loadUnit(unitId);
  if (!file) throw new InvalidReferenceError("An image file is required");
  const max = await prisma.unitPhoto.aggregate({ where: { unitId }, _max: { sortOrder: true } });
  const photo = await prisma.unitPhoto.create({
    data: { unitId, data: file.buffer, mimeType: file.mimetype, size: file.size,
      sortOrder: (max._max.sortOrder || 0) + 1, createdById: user?.userId || null, createdByName: await resolveName(user) },
    select: PHOTO_META,
  });
  return photo;
}
export async function deletePhoto(user, unitId, photoId) {
  await assertPhotoInUnit(unitId, photoId);
  await prisma.unitPhoto.delete({ where: { id: photoId } });
  const listing = await prisma.unitListing.findUnique({ where: { unitId } });
  if (listing?.coverPhotoId === photoId) await prisma.unitListing.update({ where: { unitId }, data: { coverPhotoId: null } });
  return getForUnit(unitId);
}
export async function reorderPhotos(user, unitId, orderedIds) {
  await loadUnit(unitId);
  for (const id of orderedIds) await assertPhotoInUnit(unitId, id);
  await prisma.$transaction(orderedIds.map((id, i) => prisma.unitPhoto.update({ where: { id }, data: { sortOrder: i + 1 } })));
  return getForUnit(unitId);
}
export async function updatePhotoCaption(user, unitId, photoId, caption) {
  await assertPhotoInUnit(unitId, photoId);
  await prisma.unitPhoto.update({ where: { id: photoId }, data: { caption: caption ?? null } });
  return getForUnit(unitId);
}
export async function setCover(user, unitId, photoId) {
  await loadUnit(unitId);
  await assertPhotoInUnit(unitId, photoId);
  const data = { coverPhotoId: photoId };
  await prisma.unitListing.upsert({ where: { unitId }, create: { unitId, ...data, details: {}, visibleFields: DEFAULT_VISIBLE_FIELDS }, update: data });
  return getForUnit(unitId);
}
export async function getPhotoForStaff(unitId, photoId) {
  const photo = await assertPhotoInUnit(unitId, photoId);
  const row = await prisma.unitPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true } });
  return row;
}
