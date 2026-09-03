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
const unit = await prisma.unit.create({ data: { ownerId: owner.id, unitNumber: "15-08", building: "Capitol Commons · Tower 2", floor: "15", type: "2 Bedrooms", baseRent: 85000, status: "VACANT" } });
log(`Lessor/owner: ${owner.name}  ·  Unit ${unit.unitNumber} (${unit.building}) @ ₱${unit.baseRent}/mo`);

const officerCred = { email: `officer.${S}`, password: "leasing123" };
await api("POST", "/auth/register", { token: adminToken, body: { name: "Officer Jaime Delacruz", ...officerCred, role: "LEASING_OFFICER" } });
const officerLogin = await api("POST", "/auth/login", { body: officerCred });
const officer = officerLogin.token;
log(`O-Lease officer: Officer Jaime Delacruz  (login: ${officerCred.email} / ${officerCred.password})`);

const lesseeCred = { email: `ana.reyes.${S}`, password: "lessee1234" };
const signupRes = await api("POST", "/auth/signup", { body: {
  name: "Ana Reyes", ...lesseeCred,
  contactEmail: `ana.reyes.${S}@example.com`, role: "TENANT", consent: true,
} });
log(`Lessee signed up — account ${signupRes.status} (${signupRes.user.id.slice(0, 8)}…), pending approval`);
// Account-approval gate: an ADMIN/O-Lease officer must approve the sign-up before
// the applicant can log in; approval also creates the linked Tenant record.
await api("PATCH", `/auth/pending/${signupRes.user.id}/approve`, { token: adminToken });
const lesseeLogin = await api("POST", "/auth/login", { body: lesseeCred });
const lessee = lesseeLogin.token;
const lesseeUser = await prisma.user.findUnique({ where: { email: lesseeCred.email } });
const tenantId = lesseeUser.tenantId;
log(`Lessee: Ana Reyes approved & signed in  (login: ${lesseeCred.email} / ${lesseeCred.password})  ·  tenantId ${tenantId?.slice(0, 8)}…`);

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

// ---------------------------------------------------------------- link
step(3, "Link records — unit, lessee & lessor onto the transaction");
await api("PATCH", `/leasing-transactions/${T}/link`, { token: officer, body: { unitId: unit.id, tenantId, unitOwnerId: owner.id } });
log(`Linked unit ${unit.unitNumber} + lessee Ana Reyes + lessor ${owner.name}`);

let t;
// Drive the current stage through the given statuses, then advance to the next.
async function walk(label, statuses, { advance = true } = {}) {
  for (const st of statuses) {
    t = await api("PATCH", `/leasing-transactions/${T}/status`, { token: officer, body: { status: st } });
  }
  if (advance) t = await api("PATCH", `/leasing-transactions/${T}/advance`, { token: officer, body: {} });
  log(`${label}: ${statuses.join(" → ")}${advance ? `  → advanced to ${t.stage}` : "  (final stage)"}`);
}

// ---------------------------------------------------------------- SEND_REQUIREMENTS
step(4, "Send Requirements — lessee uploads documents");
await uploadDoc(T, lessee, "Valid-ID.pdf", "%PDF-1.4 valid government id");
await uploadDoc(T, lessee, "Proof-of-Income.pdf", "%PDF-1.4 proof of income");
log("Lessee uploaded: Valid-ID.pdf, Proof-of-Income.pdf");
await walk("Requirements", ["Submitted", "Complete"]);

// ---------------------------------------------------------------- APPROVAL
step(5, "Approval — 4-step routing chain (Leasing → Management → Authorized Approver → Final Approval)");
await api("PATCH", `/leasing-transactions/${T}/status`, { token: officer, body: { status: "Submitted" } });
const steps = await api("GET", `/leasing-transactions/${T}/approval-steps`, { token: officer });
for (const s of steps) {
  const r = await api("PATCH", `/leasing-transactions/${T}/approval-steps/${s.id}`, { token: officer, body: { status: "Approved", remarks: `${s.name} cleared` } });
  log(`  ✓ ${s.name} approved — stage status: ${r.status}`);
}
t = await api("PATCH", `/leasing-transactions/${T}/advance`, { token: officer, body: { remarks: "All approvals complete" } });
log(`→ advanced to ${t.stage}`);

// ---------------------------------------------------------------- UNIT_INSPECTION
step(6, "Unit Inspection");
await walk("Unit Inspection", ["Scheduled", "In Progress", "Passed"]);

// ---------------------------------------------------------------- KEY_TURNOVER
step(7, "Key Turnover");
await walk("Key Turnover", ["Scheduled", "Completed"]);

// ---------------------------------------------------------------- PHOTOSHOOT (final)
step(8, "Photoshoot (final stage)");
await walk("Photoshoot", ["Scheduled", "In Progress", "Completed"], { advance: false });

// ---------------------------------------------------------------- summary
const finalTxn = await api("GET", `/leasing-transactions/${T}`, { token: officer });
log(`\n═════ COMPLETE ═════`);
log(`${finalTxn.reference}  ·  stage: ${finalTxn.stage}  ·  status: ${finalTxn.status}  ·  final: ${finalTxn.finalStatus}`);
log(`Lessee: ${finalTxn.tenant?.name}  ·  Unit: ${finalTxn.unit?.unitNumber}  ·  Officer: ${finalTxn.assignedOfficer?.name}`);
log(`Documents: ${finalTxn.documents.map((d) => d.filename).join(", ")}`);
log(`Approval: ${finalTxn.approvalSteps.map((s) => s.name + "=" + s.status).join(", ")}`);
log(`Activity events: ${finalTxn.events.length}`);
log(`\nView it:`);
log(`  Staff cockpit:  /app/transactions/${T}   (login ${officerCred.email} / ${officerCred.password})`);
log(`  Lessee portal:  /app/leasing-progress    (login ${lesseeCred.email} / ${lesseeCred.password})`);

await prisma.$disconnect();
