import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";

const BASE = "http://localhost:5050/api";
const S = Math.floor(Math.random() * 900 + 100);
const log = (...a) => console.log(...a);
const step = (n, t) => log(`\n── ${n}. ${t} ──`);

async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return data;
}
async function uploadDoc(txnId, token, name, bytes) {
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from(bytes)], { type: "application/pdf" }), name);
  return api("POST", `/leasing-transactions/${txnId}/documents`, { token, form: fd });
}

const adminToken = issueToken({ id: "sim-admin", role: "ADMIN" });

// ---------------------------------------------------------------- setup
step(0, "Setup — owner, unit, officer & lessee accounts");
const owner = await prisma.unitOwner.create({ data: { name: "OLZ Realty (sim)", email: "leasing@olz.sim", phone: "0917-000-0000" } });
const unit = await prisma.unit.create({ data: { ownerId: owner.id, unitNumber: "15-08", building: "Capitol Commons · Tower 2", floor: "15", type: "RESIDENTIAL", baseRent: 85000, status: "VACANT" } });
log(`Lessor/owner: ${owner.name}  ·  Unit ${unit.unitNumber} (${unit.building}) @ ₱${unit.baseRent}/mo`);

const officerCred = { email: `officer.${S}`, password: "leasing123" };
await api("POST", "/auth/register", { token: adminToken, body: { name: "Officer Jaime Delacruz", ...officerCred, role: "LEASING_OFFICER" } });
const officerLogin = await api("POST", "/auth/login", { body: officerCred });
const officer = officerLogin.token;
log(`O-Lease officer: Officer Jaime Delacruz  (login: ${officerCred.email} / ${officerCred.password})`);

const lesseeCred = { email: `ana.reyes.${S}`, password: "lessee123" };
const signup = await api("POST", "/auth/signup", { body: { name: "Ana Reyes", ...lesseeCred, role: "TENANT" } });
const lessee = signup.token;
const lesseeUser = await prisma.user.findUnique({ where: { email: lesseeCred.email } });
const tenantId = lesseeUser.tenantId;
log(`Lessee: Ana Reyes  (login: ${lesseeCred.email} / ${lesseeCred.password})`);

// ---------------------------------------------------------------- stage 1-2
step(1, "Inquiry — lessee submits from the public site");
const inquiry = await api("POST", "/inquiries", { body: {
  category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
  fullName: "Ana Reyes", email: `ana.reyes.${S}@example.com`, message: "Interested in a 2BR at Capitol Commons, move-in next month.", consent: true,
} });
log(`Inquiry submitted (${inquiry.id.slice(0, 8)}…)`);

step(2, "Accept Inquiry — officer takes ownership → transaction auto-created");
await api("PATCH", `/inquiries/${inquiry.id}/accept`, { token: officer });
const txn0 = (await api("GET", "/leasing-transactions", { token: officer })).find((t) => t.inquiry?.id === inquiry.id);
const T = txn0.id;
log(`Transaction ${txn0.reference} created — now at ${txn0.stage} (${txn0.status})`);

// ---------------------------------------------------------------- stage 3
step(3, "Unit Registration — link the unit, lessee & lessor");
await api("PATCH", `/leasing-transactions/${T}/link`, { token: officer, body: { unitId: unit.id, tenantId, unitOwnerId: owner.id } });
await api("PATCH", `/leasing-transactions/${T}/status`, { token: officer, body: { status: "Unit Registered", remarks: "Unit 15-08 assigned to Ana Reyes" } });
let t = await api("PATCH", `/leasing-transactions/${T}/advance`, { token: officer, body: { remarks: "Proceeding to approval" } });
log(`Linked unit + lessee + lessor → advanced to ${t.stage}`);

// ---------------------------------------------------------------- stage 4
step(4, "Approval — lessee uploads documents, 4-level routing chain");
await uploadDoc(T, lessee, "Valid-ID.pdf", "%PDF-1.4 valid government id");
await uploadDoc(T, lessee, "Proof-of-Income.pdf", "%PDF-1.4 proof of income");
log("Lessee uploaded: Valid-ID.pdf, Proof-of-Income.pdf");
await api("PATCH", `/leasing-transactions/${T}/status`, { token: officer, body: { status: "Submitted" } });
const steps = await api("GET", `/leasing-transactions/${T}/approval-steps`, { token: officer });
for (const s of steps) {
  const r = await api("PATCH", `/leasing-transactions/${T}/approval-steps/${s.id}`, { token: officer, body: { status: "Approved", remarks: `${s.name} cleared` } });
  log(`  ✓ ${s.name} approved — stage status: ${r.status}`);
}
t = await api("PATCH", `/leasing-transactions/${T}/advance`, { token: officer, body: { remarks: "All approvals complete" } });
log(`→ advanced to ${t.stage}`);

// ---------------------------------------------------------------- stages 5-9
async function walk(label, statuses) {
  for (const st of statuses) await api("PATCH", `/leasing-transactions/${T}/status`, { token: officer, body: { status: st } });
  t = await api("PATCH", `/leasing-transactions/${T}/advance`, { token: officer, body: {} });
  log(`${label}: ${statuses.join(" → ")}  → advanced to ${t.stage}`);
}
step(5, "Unit Shoot");
await walk("Unit Shoot", ["Scheduled", "In Progress", "Completed"]);
step(6, "Accomplishment Form");
await walk("Accomplishment Form", ["Submitted", "Under Review", "Accepted"]);
step(7, "Letter of Intent");
await walk("Letter of Intent", ["For Lessee Review", "Submitted", "For Lessor Review", "Accepted"]);
step(8, "Unit Inspection");
await walk("Unit Inspection", ["Scheduled", "In Progress", "Passed"]);
step(9, "Contract Signing");
await walk("Contract Signing", ["For Review", "For Lessee Signing", "For Lessor Signing", "Fully Executed"]);

// ---------------------------------------------------------------- stage 10
step(10, "Final Status");
await api("PATCH", `/leasing-transactions/${T}/status`, { token: officer, body: { status: "Active", remarks: "Lease executed and active" } });

// ---------------------------------------------------------------- summary
const finalTxn = await api("GET", `/leasing-transactions/${T}`, { token: officer });
log(`\n═════ COMPLETE ═════`);
log(`${finalTxn.reference}  ·  stage: ${finalTxn.stage}  ·  final status: ${finalTxn.finalStatus}`);
log(`Lessee: ${finalTxn.tenant?.name}  ·  Unit: ${finalTxn.unit?.unitNumber}  ·  Officer: ${finalTxn.assignedOfficer?.name}`);
log(`Documents: ${finalTxn.documents.map((d) => d.filename).join(", ")}`);
log(`Approval: ${finalTxn.approvalSteps.map((s) => s.name + "=" + s.status).join(", ")}`);
log(`Activity events: ${finalTxn.events.length}`);
log(`\nView it:`);
log(`  Staff cockpit:  /app/transactions/${T}   (login ${officerCred.email} / ${officerCred.password})`);
log(`  Lessee portal:  /app/leasing-progress    (login ${lesseeCred.email} / ${lesseeCred.password})`);

await prisma.$disconnect();
