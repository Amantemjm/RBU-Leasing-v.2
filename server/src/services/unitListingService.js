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
