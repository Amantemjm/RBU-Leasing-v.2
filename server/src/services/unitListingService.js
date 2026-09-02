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
    details: defaultDetails(unit), visibleFields: [...DEFAULT_VISIBLE_FIELDS], coverPhotoId: null,
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
  const unit = await loadUnit(unitId);
  await assertPhotoInUnit(unitId, photoId);
  const data = { coverPhotoId: photoId };
  await prisma.unitListing.upsert({ where: { unitId }, create: { unitId, ...data, details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS }, update: data });
  return getForUnit(unitId);
}
export async function getPhotoForStaff(unitId, photoId) {
  const photo = await assertPhotoInUnit(unitId, photoId);
  const row = await prisma.unitPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true } });
  return row;
}

function cardDetails(listing) {
  const details = listing.details || {};
  const visible = Array.isArray(listing.visibleFields) ? listing.visibleFields : [];
  const out = {};
  for (const k of visible) if (details[k] !== undefined) out[k] = details[k];
  return out;
}

export async function publish(user, unitId) {
  const unit = await loadUnit(unitId);
  if (unit.approvalStatus !== "APPROVED") throw new ConflictError("Only an approved unit can be published");
  const count = await prisma.unitPhoto.count({ where: { unitId } });
  if (count === 0) throw new ConflictError("Add at least one photo before publishing");
  await prisma.unitListing.upsert({
    where: { unitId },
    create: { unitId, published: true, publishedAt: new Date(), details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS },
    update: { published: true, publishedAt: new Date() },
  });
  return getForUnit(unitId);
}
export async function unpublish(user, unitId) {
  const unit = await loadUnit(unitId);
  await prisma.unitListing.upsert({
    where: { unitId }, create: { unitId, published: false, details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS },
    update: { published: false },
  });
  return getForUnit(unitId);
}

// Staff Content-Manager listing table: every unit with a listing summary
// (metadata only — never photo bytes).
export async function listAll() {
  const units = await prisma.unit.findMany({
    include: {
      tower: { select: { name: true, estate: { select: { id: true, name: true } } } },
      listing: { select: { published: true, publishedAt: true, coverPhotoId: true } },
      _count: { select: { photos: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return units.map((u) => ({
    unitId: u.id,
    unitNumber: u.unitNumber,
    propertyName: u.building || u.tower?.name || null,
    location: [u.tower?.name, u.tower?.estate?.name].filter(Boolean).join(", ") || null,
    approvalStatus: u.approvalStatus,
    status: u.status,
    published: u.listing?.published || false,
    publishedAt: u.listing?.publishedAt || null,
    coverPhotoId: u.listing?.coverPhotoId || null,
    photoCount: u._count.photos,
    updatedAt: u.updatedAt,
  }));
}

export async function listPublic({ estateId, type } = {}) {
  const unitFilter = {};
  if (type) unitFilter.type = type;
  if (estateId) unitFilter.tower = { is: { estateId } };
  const listings = await prisma.unitListing.findMany({
    where: { published: true, unit: { is: { status: "VACANT", approvalStatus: "APPROVED", ...unitFilter } } },
    include: { unit: { select: { id: true, type: true, tower: { select: { name: true, estate: { select: { id: true, name: true } } } } } } },
    orderBy: { publishedAt: "desc" },
  });
  const cards = [];
  for (const l of listings) {
    const photos = await prisma.unitPhoto.findMany({ where: { unitId: l.unitId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    const photoIds = photos.map((p) => p.id);
    cards.push({
      unitId: l.unitId, headline: l.headline, type: l.unit.type,
      location: [l.unit.tower?.name, l.unit.tower?.estate?.name].filter(Boolean).join(", ") || null,
      estate: l.unit.tower?.estate || null,
      details: cardDetails(l),
      coverPhotoId: l.coverPhotoId && photoIds.includes(l.coverPhotoId) ? l.coverPhotoId : (photoIds[0] || null),
      photoIds,
    });
  }
  return cards;
}
export async function getPublic(unitId) {
  const l = await prisma.unitListing.findUnique({
    where: { unitId },
    include: { unit: { select: { id: true, type: true, status: true, approvalStatus: true, tower: { select: { name: true, estate: { select: { id: true, name: true } } } } } } },
  });
  if (!l || !l.published || l.unit.status !== "VACANT" || l.unit.approvalStatus !== "APPROVED") throw new NotFoundError("Unit not found");
  const photos = await prisma.unitPhoto.findMany({ where: { unitId }, orderBy: { sortOrder: "asc" }, select: { id: true, caption: true } });
  const photoIds = photos.map((p) => p.id);
  return {
    unitId, headline: l.headline, type: l.unit.type,
    location: [l.unit.tower?.name, l.unit.tower?.estate?.name].filter(Boolean).join(", ") || null,
    details: cardDetails(l), photos, photoIds,
    coverPhotoId: l.coverPhotoId && photoIds.includes(l.coverPhotoId) ? l.coverPhotoId : (photoIds[0] || null),
  };
}
export async function getPhotoBytes(photoId, { requirePublished } = {}) {
  const photo = await prisma.unitPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true, unitId: true } });
  if (!photo) throw new NotFoundError("Photo not found");
  if (requirePublished) {
    const l = await prisma.unitListing.findUnique({ where: { unitId: photo.unitId }, include: { unit: { select: { status: true, approvalStatus: true } } } });
    if (!l || !l.published || l.unit.status !== "VACANT" || l.unit.approvalStatus !== "APPROVED") throw new NotFoundError("Photo not found");
  }
  return { data: photo.data, mimeType: photo.mimeType };
}
