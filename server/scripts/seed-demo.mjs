// Seeds a demo system: one cast per role, walked through every module so each
// one holds data in several states rather than a single happy path.
//
// Runs against a live API. Assumes the database has been cleared apart from the
// admin login and the estate/tower catalogue.
import "dotenv/config";
import zlib from "node:zlib";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";

const BASE = process.env.SEED_BASE || "http://localhost:5050/api";
const log = (...a) => console.log(...a);
const step = (t) => log(`\n── ${t}`);

async function raw(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function api(method, path, opts = {}) {
  const r = await raw(method, path, opts);
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.data).slice(0, 260)}`);
  return r.data;
}
const pdf = (name) => {
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from("%PDF-1.4 demo document")], { type: "application/pdf" }), name);
  return fd;
};
const typedDoc = (name, docType) => { const fd = pdf(name); fd.append("docType", docType); return fd; };
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();

// A listing cannot be published without a photo, so the seed generates one.
// Building the PNG by hand keeps this script dependency-free — a stand-in
// image, clearly synthetic, not a stock photo pretending to be the unit.
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return ~c >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h, pixel) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); raw[o++] = r; raw[o++] = g; raw[o++] = b; } }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
// A soft diagonal wash between two tones, so the gallery cards read as images
// rather than flat blocks.
const photoFor = ([r1, g1, b1], [r2, g2, b2]) => makePng(800, 520, (x, y) => {
  const t = Math.min(1, (x / 800) * 0.6 + (y / 520) * 0.6);
  return [Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t)];
});
async function uploadPhoto(unitId, bytes, filename) {
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: "image/png" }), filename);
  return api("POST", `/unit-listings/${unitId}/photos`, { token: officer, form: fd });
}

const LESSOR_KEYS = ["GOV_ID", "OWNERSHIP", "TAX_DEC", "RPT_RECEIPT", "AUTH_LETTER", "ASSOC_CLEARANCE", "BANK_DETAILS"];
const LESSEE_KEYS = ["GOV_ID", "PROOF_INCOME", "COE", "COMPANY_ID", "CLEARANCE", "PROOF_BILLING", "PAYMENT"];

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true } });
if (!admin) throw new Error("No ADMIN user — refusing to seed.");
const adminToken = issueToken({ id: admin.id, role: "ADMIN" });
const towers = await prisma.tower.findMany({ include: { estate: true }, orderBy: { name: "asc" } });
const tower = (n) => towers.find((t) => t.name.toLowerCase().includes(n.toLowerCase())) || towers[0];

const CRED = [];
const remember = (role, name, email, password) => CRED.push({ role, name, email, password });

// ─────────────────────────────────────────────────────────── staff accounts
step("Staff logins (created by the admin)");
const STAFF = [
  { name: "Ramon Cruz", email: "officer.cruz", password: "Leasing2026!", role: "LEASING_OFFICER" },
  { name: "Elena Reyes", email: "officer.reyes", password: "Leasing2026!", role: "LEASING_OFFICER" },
  { name: "Vicente Lim", email: "viewer.audit", password: "Viewer2026!", role: "VIEWER" },
];
const tok = {};
for (const s of STAFF) {
  await api("POST", "/auth/register", { token: adminToken, body: s });
  tok[s.email] = (await api("POST", "/auth/login", { body: { email: s.email, password: s.password } })).token;
  remember(s.role, s.name, s.email, s.password);
  log(`   ${s.role.padEnd(16)} ${s.name}`);
}
const officer = tok["officer.cruz"], officer2 = tok["officer.reyes"], viewer = tok["viewer.audit"];

// ─────────────────────────────────────────────────── portal signups + approval
step("Portal signups, then admin approval");
const PORTAL = [
  { name: "Maria Santos", email: "lessor.santos", password: "Lessor2026!", role: "UNIT_OWNER", contactEmail: "maria.santos@example.com", approve: true },
  { name: "Benjamin Tan", email: "lessor.tan", password: "Lessor2026!", role: "UNIT_OWNER", contactEmail: "ben.tan@example.com", approve: true },
  { name: "Ana Garcia", email: "lessee.garcia", password: "Lessee2026!", role: "TENANT", contactEmail: "ana.garcia@example.com", approve: true },
  { name: "Paolo Dela Cruz", email: "lessee.delacruz", password: "Lessee2026!", role: "TENANT", contactEmail: "paolo.dc@example.com", approve: true },
  // Left pending on purpose, so the Account Approvals queue is not empty.
  { name: "Rosa Mendoza", email: "lessee.pending", password: "Lessee2026!", role: "TENANT", contactEmail: "rosa.m@example.com", approve: false },
];
const party = {};
for (const u of PORTAL) {
  await api("POST", "/auth/signup", { body: { name: u.name, email: u.email, password: u.password, contactEmail: u.contactEmail, consent: true, role: u.role } });
  remember(u.role + (u.approve ? "" : " (PENDING)"), u.name, u.email, u.password);
}
const pending = await api("GET", "/auth/pending", { token: adminToken });
for (const u of PORTAL.filter((x) => x.approve)) {
  const row = pending.find((p) => p.email === u.email);
  const approved = await api("PATCH", `/auth/pending/${row.id}/approve`, { token: adminToken });
  party[u.email] = {
    ...approved,
    token: (await api("POST", "/auth/login", { body: { email: u.email, password: u.password } })).token,
  };
  log(`   approved ${u.role.padEnd(11)} ${u.name}`);
}
log(`   left pending          Rosa Mendoza  (so the approvals queue has work)`);

const santos = party["lessor.santos"], tan = party["lessor.tan"];
const garcia = party["lessee.garcia"], paolo = party["lessee.delacruz"];

// Officers own the parties they work with.
await api("PATCH", `/owners/${santos.unitOwnerId}/assign`, { token: adminToken, body: { assignedOfficerId: (await api("GET", "/auth/users", { token: adminToken })).find((u) => u.email === "officer.cruz").id } });

// ──────────────────────────────────────────────────────────────────── units
step("Units — across every approval state");
const mkUnit = async (owner, body, { submit = false } = {}) =>
  api("POST", "/units", { token: owner.token, body: { ownerId: owner.unitOwnerId, ...body, submit } });

const u1 = await mkUnit(santos, { unitNumber: "12E", towerId: tower("Ibiza").id, building: tower("Ibiza").name, floor: "12", type: "1 Bedroom", baseRent: 32000 }, { submit: true });
const u2 = await mkUnit(santos, { unitNumber: "19A", towerId: tower("Royalton").id, building: tower("Royalton").name, floor: "19", type: "2 Bedrooms", baseRent: 48000 }, { submit: true });
const u3 = await mkUnit(santos, { unitNumber: "07C", towerId: tower("Avila").id, building: tower("Avila").name, floor: "7", type: "Studio", baseRent: 21000 });
const u4 = await mkUnit(tan, { unitNumber: "23F", towerId: tower("Empress").id, building: tower("Empress").name, floor: "23", type: "2 Bedrooms", baseRent: 55000 }, { submit: true });
const u5 = await mkUnit(tan, { unitNumber: "05B", towerId: tower("Connor").id, building: tower("Connor").name, floor: "5", type: "1 Bedroom", baseRent: 29000 }, { submit: true });
// Three more that stay vacant, so the public gallery has stock to show once
// 12E and 19A are leased and correctly drop out of it.
const u6 = await mkUnit(santos, { unitNumber: "31B", towerId: tower("Glaston").id, building: tower("Glaston").name, floor: "31", type: "1 Bedroom", baseRent: 34000 }, { submit: true });
const u7 = await mkUnit(tan, { unitNumber: "08H", towerId: tower("Ibiza").id, building: tower("Ibiza").name, floor: "8", type: "Studio", baseRent: 19500 }, { submit: true });
const u8 = await mkUnit(santos, { unitNumber: "22D", towerId: tower("Royalton").id, building: tower("Royalton").name, floor: "22", type: "2 Bedrooms", baseRent: 52000 }, { submit: true });
for (const u of [u6, u7, u8]) await api("PATCH", `/units/${u.id}/approve`, { token: officer });

await api("PATCH", `/units/${u1.id}/approve`, { token: officer });
await api("PATCH", `/units/${u2.id}/approve`, { token: officer });
await api("PATCH", `/units/${u4.id}/approve`, { token: officer2 });
await api("PATCH", `/units/${u5.id}/reject`, { token: officer2, body: { remarks: "Floor plan and RPT receipt do not match the unit number. Please correct and resubmit." } });
log("   6 approved · 1 rejected with remarks · 1 still a draft");

step("Listings — publish the approved units");
// Detail keys come from shared/unitListingFields.js and are validated server-side.
const LISTINGS = [
  // floorArea / bedrooms / bathrooms / rentalRate are number fields and
  // amenities is a list — the card formats them, so the values must be raw.
  [u1, "Bright 1BR at Ibiza Tower", { unitType: "1 Bedroom", floorArea: 38, bedrooms: 1, bathrooms: 1, rentalRate: 32000,
     amenities: ["Swimming pool", "Gym", "24/7 security"], description: "North-facing one bedroom with a balcony, a short walk from Estancia Mall.", availabilityStatus: "Leased" }],
  [u2, "Corner 2BR at The Royalton", { unitType: "2 Bedrooms", floorArea: 62, bedrooms: 2, bathrooms: 2, rentalRate: 48000,
     amenities: ["Swimming pool", "Function room", "Covered parking"], description: "Corner unit on the 19th floor with city views.", availabilityStatus: "Leased" }],
  [u4, "High-floor 2BR at Empress", { unitType: "2 Bedrooms", floorArea: 70, bedrooms: 2, bathrooms: 2, rentalRate: 55000,
     amenities: ["Sky lounge", "Gym", "Two parking slots"], description: "Twenty-third floor, semi-furnished and ready for occupancy.", availabilityStatus: "Available" }],
  [u6, "Quiet 1BR at Glaston", { unitType: "1 Bedroom", floorArea: 41, bedrooms: 1, bathrooms: 1, rentalRate: 34000,
     amenities: ["Gym", "Lap pool", "Visitor parking"], description: "Thirty-first floor, unfurnished, facing the garden podium.", availabilityStatus: "Available" }],
  [u7, "Compact studio at Ibiza Tower", { unitType: "Studio", floorArea: 26, bathrooms: 1, rentalRate: 19500,
     amenities: ["Swimming pool", "24/7 security", "Laundry area"], description: "Efficient studio a short walk from Estancia Mall.", availabilityStatus: "Available" }],
  [u8, "Spacious 2BR at The Royalton", { unitType: "2 Bedrooms", floorArea: 66, bedrooms: 2, bathrooms: 2, rentalRate: 52000,
     amenities: ["Sky deck", "Gym", "One parking slot"], description: "Twenty-second floor with an open kitchen and balcony.", availabilityStatus: "Available" }],
];
const TONES = [[[26, 74, 52], [122, 168, 140]], [[31, 58, 92], [128, 158, 190]], [[74, 58, 40], [186, 160, 126]]];
for (const [i, [u, headline, details]] of LISTINGS.entries()) {
  // Content and publication are separate endpoints, and a listing cannot go
  // live without at least one photo — so upload first, then publish.
  await api("PATCH", `/unit-listings/${u.id}`, {
    token: officer,
    body: { headline, details, visibleFields: Object.keys(details) },
  });
  await uploadPhoto(u.id, photoFor(...TONES[i % TONES.length]), `${u.unitNumber}-living.png`);
  await uploadPhoto(u.id, photoFor(TONES[i % TONES.length][1], TONES[i % TONES.length][0]), `${u.unitNumber}-bedroom.png`);
  await api("PATCH", `/unit-listings/${u.id}/publish`, { token: officer });
}
const live = await api("GET", "/public/units");
log(`   ${live.length} listing(s) live on the public gallery`);

// ───────────────────────────────────────────────────────────── requirements
step("Lessor checklists");
for (const k of LESSOR_KEYS) await api("POST", `/lessor-requirements/mine/${k}`, { token: santos.token, form: pdf(`${k.toLowerCase()}.pdf`) });
for (const r of await api("GET", `/lessor-requirements/${santos.unitOwnerId}`, { token: officer })) {
  if (r.id) await api("PATCH", `/lessor-requirements/${r.id}/review`, { token: officer, body: { status: "Approved", remarks: "Verified" } });
}
log("   Santos — all 7 approved");

for (const k of LESSOR_KEYS.slice(0, 4)) await api("POST", `/lessor-requirements/mine/${k}`, { token: tan.token, form: pdf(`${k.toLowerCase()}.pdf`) });
const tanReqs = await api("GET", `/lessor-requirements/${tan.unitOwnerId}`, { token: officer2 });
await api("PATCH", `/lessor-requirements/${tanReqs.find((r) => r.requirementKey === "TAX_DEC").id}/review`, { token: officer2, body: { status: "Rejected", remarks: "Tax declaration is for a different property." } });
log("   Tan — 4 of 7 submitted, 1 rejected, 3 still outstanding");

step("Lessee checklists");
for (const k of LESSEE_KEYS) await api("POST", `/lessee-requirements/mine/${k}`, { token: garcia.token, form: pdf(`${k.toLowerCase()}.pdf`) });
const gReqs = await api("GET", `/lessee-requirements/${garcia.tenantId}`, { token: officer });
for (const r of gReqs) if (r.id && r.requirementKey !== "CLEARANCE") await api("PATCH", `/lessee-requirements/${r.id}/review`, { token: officer, body: { status: "Approved" } });
await api("PATCH", `/lessee-requirements/${gReqs.find((r) => r.requirementKey === "CLEARANCE").id}/review`, { token: officer, body: { status: "Rejected", remarks: "NBI clearance has expired — please submit a current copy." } });
log("   Garcia — 6 approved, 1 rejected with a remark");

for (const k of LESSEE_KEYS.slice(0, 3)) await api("POST", `/lessee-requirements/mine/${k}`, { token: paolo.token, form: pdf(`${k.toLowerCase()}.pdf`) });
log("   Dela Cruz — 3 submitted, awaiting review");

// ───────────────────────────────────────────────────────────────── inquiries
step("Inquiries");
const inq = async (b) => api("POST", "/inquiries", { body: { category: "RESIDENCES", consent: true, ...b } });
const iGarcia = await inq({ inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana Garcia", email: "ana.garcia@example.com", message: "Interested in a 2BR at Capitol Commons." });
const iPaolo = await inq({ inquirerType: "LESSEE", inquiryType: "Property Viewing", fullName: "Paolo Dela Cruz", email: "paolo.dc@example.com", message: "Can I view the Ibiza Tower unit this week?" });
await inq({ inquirerType: "LESSEE", inquiryType: "Rental Rate", fullName: "Jonas Villar", email: "jonas.v@example.com", message: "What is the rate for a studio?" });
await inq({ inquirerType: "LESSOR", inquiryType: "List Unit for Lease", fullName: "Celia Ong", email: "celia.ong@example.com", message: "I have two units to list." });
log("   4 submitted — 2 will be accepted, 2 left unassigned in the pool");

// ─────────────────────────────────────────────────────────── transactions
step("Transaction A — walked all the way to a signed contract");
await api("PATCH", `/inquiries/${iGarcia.id}/accept`, { token: officer });
const txnA = (await api("GET", "/leasing-transactions", { token: officer })).find((t) => t.inquiryId === iGarcia.id);
await api("PATCH", `/leasing-transactions/${txnA.id}/link`, { token: officer, body: { unitId: u2.id, tenantId: garcia.tenantId, unitOwnerId: santos.unitOwnerId } });

const setStatus = (id, status, t = officer) => api("PATCH", `/leasing-transactions/${id}/status`, { token: t, body: { status } });
const advance = (id, t = officer) => api("PATCH", `/leasing-transactions/${id}/advance`, { token: t, body: {} });

await setStatus(txnA.id, "Complete"); await advance(txnA.id);
for (const s of await api("GET", `/leasing-transactions/${txnA.id}/approval-steps`, { token: officer })) {
  await api("PATCH", `/leasing-transactions/${txnA.id}/approval-steps/${s.id}`, { token: officer, body: { status: "Approved", remarks: "Cleared" } });
}
await advance(txnA.id);
let a = await api("POST", `/appointments/transaction/${txnA.id}/UNIT_INSPECTION`, { token: officer, body: { scheduledAt: days(-6), location: "The Royalton · Unit 19A" } });
await api("PATCH", `/appointments/${a.id}/complete`, { token: officer, body: { outcome: "Passed" } });
await advance(txnA.id);
a = await api("POST", `/appointments/transaction/${txnA.id}/KEY_TURNOVER`, { token: officer, body: { scheduledAt: days(-4), location: "RBU Leasing Office" } });
await api("PATCH", `/appointments/${a.id}/complete`, { token: officer, body: {} });
await advance(txnA.id);
a = await api("POST", `/appointments/transaction/${txnA.id}/PHOTOSHOOT`, { token: officer, body: { scheduledAt: days(-2), location: "The Royalton · Unit 19A" } });
await api("PATCH", `/appointments/${a.id}/complete`, { token: officer, body: {} });
await api("POST", `/leasing-transactions/${txnA.id}/documents`, { token: officer, form: typedDoc("letter-of-intent.pdf", "LETTER_OF_INTENT") });
await api("POST", `/leasing-transactions/${txnA.id}/documents`, { token: officer, form: typedDoc("signed-lease-contract.pdf", "SIGNED_CONTRACT") });
const doneA = await api("GET", `/leasing-transactions/${txnA.id}`, { token: officer });
log(`   ${doneA.reference} → ${doneA.stage} / ${doneA.status}`);

step("Transaction B — parked mid-approval");
await api("PATCH", `/inquiries/${iPaolo.id}/accept`, { token: officer2 });
const txnB = (await api("GET", "/leasing-transactions", { token: officer2 })).find((t) => t.inquiryId === iPaolo.id);
await api("PATCH", `/leasing-transactions/${txnB.id}/link`, { token: officer2, body: { unitId: u1.id, tenantId: paolo.tenantId, unitOwnerId: santos.unitOwnerId } });
await setStatus(txnB.id, "Submitted", officer2);
await setStatus(txnB.id, "Complete", officer2); await advance(txnB.id, officer2);
const bSteps = await api("GET", `/leasing-transactions/${txnB.id}/approval-steps`, { token: officer2 });
for (const s of bSteps.slice(0, 2)) {
  await api("PATCH", `/leasing-transactions/${txnB.id}/approval-steps/${s.id}`, { token: officer2, body: { status: "Approved", remarks: "OK" } });
}
const doneB = await api("GET", `/leasing-transactions/${txnB.id}`, { token: officer2 });
log(`   ${doneB.reference} → ${doneB.stage} / ${doneB.status}  (2 of 4 approvals signed)`);

step("Transaction C — staff-started, inspection booked for next week");
const txnC = await api("POST", "/leasing-transactions", { token: officer, body: { lesseeName: "Celia Ong", startStage: "SEND_REQUIREMENTS" } });
await api("PATCH", `/leasing-transactions/${txnC.id}/link`, { token: officer, body: { unitId: u4.id, unitOwnerId: tan.unitOwnerId } });
await setStatus(txnC.id, "Complete"); await advance(txnC.id);
for (const s of await api("GET", `/leasing-transactions/${txnC.id}/approval-steps`, { token: officer })) {
  await api("PATCH", `/leasing-transactions/${txnC.id}/approval-steps/${s.id}`, { token: officer, body: { status: "Approved" } });
}
await advance(txnC.id);
await api("POST", `/appointments/transaction/${txnC.id}/UNIT_INSPECTION`, { token: officer, body: { scheduledAt: days(5), location: "Empress · Unit 23F" } });
const doneC = await api("GET", `/leasing-transactions/${txnC.id}`, { token: officer });
log(`   ${doneC.reference} → ${doneC.stage} / ${doneC.status}`);

// ─────────────────────────────────────────────────────────────────── leases
step("Leases");
await api("POST", "/leases", {
  token: officer,
  body: { unitId: u2.id, tenantId: garcia.tenantId, startDate: days(-2), endDate: days(363), monthlyRent: 48000, deposit: 96000,
    modeOfPayment: "Post-dated cheques", securityDeposit: "2 months", advanceRent: "1 month", managedBy: "RBU Leasing" },
});
// A second lease already near its end, so the dashboard's expiry buckets fill.
await api("POST", "/leases", {
  token: officer,
  body: { unitId: u1.id, tenantId: paolo.tenantId, startDate: days(-320), endDate: days(24), monthlyRent: 32000, deposit: 64000,
    modeOfPayment: "Bank transfer", managedBy: "RBU Leasing" },
});
await prisma.unit.updateMany({ where: { id: { in: [u1.id, u2.id] } }, data: { status: "OCCUPIED" } });
log("   2 active — one fresh, one expiring in 24 days (fills the near-expiry bucket)");

// ────────────────────────────────────────────────────────────────── summary
step("Seeded system");
const counts = {};
for (const m of ["user", "unitOwner", "tenant", "unit", "unitListing", "lease", "inquiry", "leasingTransaction", "appointment", "approvalStep", "transactionDocument", "transactionEvent", "lessorRequirement", "lesseeRequirement", "auditLog"]) {
  counts[m] = await prisma[m].count();
}
for (const [k, v] of Object.entries(counts)) log(`   ${String(v).padStart(5)}  ${k}`);

log("\n─────────────────────────── SIGN-IN CREDENTIALS ───────────────────────────");
log(`   ${"ROLE".padEnd(22)} ${"NAME".padEnd(18)} ${"USERNAME".padEnd(18)} PASSWORD`);
log(`   ${"ADMIN".padEnd(22)} ${admin.name.padEnd(18)} ${admin.email.padEnd(18)} (unchanged — your existing password)`);
for (const c of CRED) log(`   ${c.role.padEnd(22)} ${c.name.padEnd(18)} ${c.email.padEnd(18)} ${c.password}`);
log("");

await prisma.$disconnect();
