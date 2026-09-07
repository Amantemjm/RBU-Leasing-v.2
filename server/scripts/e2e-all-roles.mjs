// End-to-end walk of every role in the RBU Leasing system, against a live API.
// Exercises each role's real journey plus the permission boundaries between
// them — a 403 that should happen is as much a pass as a 200 that should.
//
// Run against a throwaway server on the TEST database, never the dev one.
import "dotenv/config";
import { issueToken } from "../src/services/authService.js";

const BASE = process.env.E2E_BASE || "http://localhost:5091/api";
const S = Math.floor(Math.random() * 900000 + 100000);

let pass = 0, fail = 0;
const results = [];
const log = (...a) => console.log(...a);
const section = (t) => log(`\n${"═".repeat(72)}\n  ${t}\n${"═".repeat(72)}`);
const step = (t) => log(`\n── ${t}`);

function ok(label, detail = "") {
  pass++; results.push({ label, ok: true });
  log(`   PASS  ${label}${detail ? `  ·  ${detail}` : ""}`);
}
function bad(label, detail = "") {
  fail++; results.push({ label, ok: false, detail });
  log(`   FAIL  ${label}${detail ? `  ·  ${detail}` : ""}`);
}

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
// Expect success; throws (and fails the run) otherwise.
async function api(method, path, opts = {}) {
  const r = await raw(method, path, opts);
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.data).slice(0, 240)}`);
  return r.data;
}
// Expect a specific refusal. The point of the test IS the refusal.
async function expectStatus(label, want, method, path, opts = {}) {
  const r = await raw(method, path, opts);
  const wanted = Array.isArray(want) ? want : [want];
  if (wanted.includes(r.status)) ok(label, `${r.status}${r.data?.error ? ` "${r.data.error}"` : ""}`);
  else bad(label, `expected ${wanted.join("/")}, got ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  return r;
}
const pdf = (n) => {
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from("%PDF-1.4 e2e")], { type: "application/pdf" }), n);
  return fd;
};
const upDoc = (txnId, token, name, docType) => {
  const fd = pdf(name);
  if (docType) fd.append("docType", docType);
  return raw("POST", `/leasing-transactions/${txnId}/documents`, { token, form: fd });
};

const LESSOR_KEYS = ["GOV_ID", "OWNERSHIP", "TAX_DEC", "RPT_RECEIPT", "AUTH_LETTER", "ASSOC_CLEARANCE", "BANK_DETAILS"];
const LESSEE_KEYS = ["GOV_ID", "PROOF_INCOME", "COE", "COMPANY_ID", "CLEARANCE", "PROOF_BILLING", "PAYMENT"];

const adminToken = issueToken({ id: "e2e-admin", role: "ADMIN" });

// ════════════════════════════════════════════════════════ A. PUBLIC VISITOR
section("A · PUBLIC VISITOR — no account, no token");

step("Browses the published listings");
const listings = await api("GET", "/public/units");
ok("Public gallery serves published listings", `${listings.length} unit(s)`);

step("Submits a lessee inquiry from the public site");
const lesseeInq = await api("POST", "/inquiries", {
  body: { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
    fullName: "Maria Santos", email: `maria.${S}@example.com`, message: "Looking for a 2BR", consent: true },
});
ok("Lessee inquiry accepted unauthenticated", `${lesseeInq.status}`);

step("Submits a lessor inquiry");
const lessorInq = await api("POST", "/inquiries", {
  body: { category: "RESIDENCES", inquirerType: "LESSOR", inquiryType: "List Unit for Lease",
    fullName: "Ramon Cruz", email: `ramon.${S}@example.com`, consent: true },
});
ok("Lessor inquiry accepted unauthenticated", `${lessorInq.status}`);

await expectStatus("Invalid inquiryType for the inquirer is refused", 400, "POST", "/inquiries", {
  body: { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Rent a Residence",
    fullName: "X", email: `x.${S}@example.com`, consent: true },
});

step("Signs up as lessor and as lessee");
const lessorCred = { email: `lessor.${S}`, password: "lessor12345" };
const lesseeCred = { email: `lessee.${S}`, password: "lessee12345" };
const lessorSignup = await api("POST", "/auth/signup", {
  body: { name: "Ramon Cruz", ...lessorCred, contactEmail: `ramon.${S}@example.com`, consent: true, role: "UNIT_OWNER" },
});
const lesseeSignup = await api("POST", "/auth/signup", {
  body: { name: "Maria Santos", ...lesseeCred, contactEmail: `maria.${S}@example.com`, consent: true, role: "TENANT" },
});
if (lessorSignup.status === "PENDING" && lesseeSignup.status === "PENDING") ok("Both signups land PENDING, no session issued");
else bad("Signups should be PENDING", JSON.stringify({ lessorSignup, lesseeSignup }));

step("Signup links the applicant's open inquiry");
// Best-effort in the service: matching contactEmail + inquirerType flips to CONVERTED.
const convCheck = await api("GET", "/inquiries", { token: adminToken });
const converted = convCheck.find((i) => i.email === `maria.${S}@example.com`);
if (converted?.status === "CONVERTED") ok("Matching inquiry auto-converted on signup", `convertedUserId set`);
else bad("Inquiry should be CONVERTED after matching signup", `status=${converted?.status}`);

await expectStatus("Login before approval is refused", 403, "POST", "/auth/login", { body: lessorCred });
await expectStatus("A staff role cannot be self-assigned at signup", 400, "POST", "/auth/signup", {
  body: { name: "Sneaky", email: `sneak.${S}`, password: "sneaky12345", contactEmail: `s.${S}@x.com`, consent: true, role: "ADMIN" },
});
await expectStatus("Duplicate username is refused", 409, "POST", "/auth/signup", {
  body: { name: "Dup", ...lessorCred, contactEmail: `d.${S}@x.com`, consent: true, role: "UNIT_OWNER" },
});
await expectStatus("Protected endpoints reject a missing token", 401, "GET", "/leasing-transactions");

// ════════════════════════════════════════════════════════════════ B. ADMIN
section("B · ADMIN — the only role holding users, assignment and audit");

step("Creates staff logins");
const officerCred = { email: `officer.${S}`, password: "officer12345" };
const viewerCred = { email: `viewer.${S}`, password: "viewer12345" };
await api("POST", "/auth/register", { token: adminToken, body: { name: "Officer Jaime Delacruz", ...officerCred, role: "LEASING_OFFICER" } });
await api("POST", "/auth/register", { token: adminToken, body: { name: "Viewer Vicky", ...viewerCred, role: "VIEWER" } });
const officer = (await api("POST", "/auth/login", { body: officerCred })).token;
const viewer = (await api("POST", "/auth/login", { body: viewerCred })).token;
ok("Staff accounts are APPROVED outright and can sign in");

step("Works the account approval queue");
const pending = await api("GET", "/auth/pending", { token: adminToken });
const pLessor = pending.find((u) => u.email === lessorCred.email);
const pLessee = pending.find((u) => u.email === lesseeCred.email);
if (pLessor && pLessee) ok("Both applicants are queued", `${pending.length} pending`);
else bad("Applicants missing from the pending queue");

const apprLessor = await api("PATCH", `/auth/pending/${pLessor.id}/approve`, { token: adminToken });
const apprLessee = await api("PATCH", `/auth/pending/${pLessee.id}/approve`, { token: adminToken });
if (apprLessor.unitOwnerId) ok("Approving a lessor creates the linked UnitOwner record");
else bad("Approval should create a UnitOwner", JSON.stringify(apprLessor));
if (apprLessee.tenantId) ok("Approving a lessee creates the linked Tenant record");
else bad("Approval should create a Tenant", JSON.stringify(apprLessee));

await expectStatus("Re-approving an already-decided account is refused", 409,
  "PATCH", `/auth/pending/${pLessor.id}/approve`, { token: adminToken });

step("Rejects a third applicant");
const rejCred = { email: `reject.${S}`, password: "reject12345" };
await api("POST", "/auth/signup", { body: { name: "Rejected Rita", ...rejCred, contactEmail: `r.${S}@x.com`, consent: true, role: "TENANT" } });
const pending2 = await api("GET", "/auth/pending", { token: adminToken });
const pRej = pending2.find((u) => u.email === rejCred.email);
await api("PATCH", `/auth/pending/${pRej.id}/reject`, { token: adminToken, body: { reason: "Incomplete details" } });
const afterRej = await api("GET", "/auth/pending", { token: adminToken });
if (!afterRej.find((u) => u.email === rejCred.email)) ok("Rejection removes the applicant from the queue");
else bad("Rejected applicant still queued");
// Documented gap: the row is deleted and the reason discarded, so the username frees up.
const reuse = await raw("POST", "/auth/signup", { body: { name: "Rita Again", ...rejCred, contactEmail: `r2.${S}@x.com`, consent: true, role: "TENANT" } });
if (reuse.status < 400) ok("Rejected username is freed for re-application", "(reason is not retained — known gap G-03)");
else bad("Rejected username should be reusable", `${reuse.status}`);

step("Admin-only surfaces");
const users = await api("GET", "/auth/users", { token: adminToken });
ok("Admin can list system users", `${users.length} user(s)`);
const audit = await api("GET", "/audit", { token: adminToken });
ok("Admin can read the audit trail", `${audit.length ?? audit.rows?.length ?? "?"} entries`);

await expectStatus("Officer cannot list users", 403, "GET", "/auth/users", { token: officer });
await expectStatus("Officer cannot read the audit trail", 403, "GET", "/audit", { token: officer });
await expectStatus("Viewer cannot read the audit trail", 403, "GET", "/audit", { token: viewer });

step("Assigns the owner to an officer");
const officerUser = users.find((u) => u.email === officerCred.email);
await api("PATCH", `/owners/${apprLessor.unitOwnerId}/assign`, { token: adminToken, body: { assignedOfficerId: officerUser.id } });
ok("Admin assigned the lessor to an officer");
await expectStatus("Officer cannot assign owners", 403,
  "PATCH", `/owners/${apprLessor.unitOwnerId}/assign`, { token: officer, body: { assignedOfficerId: officerUser.id } });
await expectStatus("Assigning to a non-officer is refused", 400,
  "PATCH", `/owners/${apprLessor.unitOwnerId}/assign`, { token: adminToken, body: { assignedOfficerId: pLessee.id } });

// ═══════════════════════════════════════════════════════════════ C. LESSOR
section("C · LESSOR (UNIT_OWNER) — brings a unit to market");

const lessor = (await api("POST", "/auth/login", { body: lessorCred })).token;
ok("Lessor can sign in once approved");

step("Registers a unit as a draft");
const draft = await api("POST", "/units", {
  token: lessor,
  body: { unitNumber: `15-${S % 90 + 10}`, building: "Capitol Commons · Tower 2", floor: "15", type: "2 Bedrooms", baseRent: 85000 },
});
if (draft.approvalStatus === "DRAFT") ok("Unit created as DRAFT", `unit ${draft.unitNumber}`);
else bad("New unit should be DRAFT", draft.approvalStatus);

step("Edits the draft, then submits it");
await api("PATCH", `/units/${draft.id}`, { token: lessor, body: { floor: "16" } });
ok("Lessor can edit their own draft");
const submitted = await api("PATCH", `/units/${draft.id}/submit`, { token: lessor });
if (submitted.approvalStatus === "SUBMITTED") ok("Unit submitted for approval");
else bad("Unit should be SUBMITTED", submitted.approvalStatus);

await expectStatus("A submitted unit can no longer be edited by its owner", 409,
  "PATCH", `/units/${draft.id}`, { token: lessor, body: { floor: "17" } });
await expectStatus("Lessor cannot approve their own unit", 403,
  "PATCH", `/units/${draft.id}/approve`, { token: lessor });

step("Uploads the seven-document lessor checklist");
const lessorList0 = await api("GET", "/lessor-requirements/mine", { token: lessor });
if (lessorList0.length === 7 && lessorList0.every((r) => r.status === "Required")) {
  ok("Checklist reads as the full seven types before anything is uploaded");
} else bad("Lessor checklist should synthesize 7 Required rows", `${lessorList0.length} rows`);

for (const key of LESSOR_KEYS) {
  await api("POST", `/lessor-requirements/mine/${key}`, { token: lessor, form: pdf(`${key.toLowerCase()}.pdf`) });
}
const lessorList1 = await api("GET", "/lessor-requirements/mine", { token: lessor });
if (lessorList1.every((r) => r.status === "Submitted")) ok("All seven lessor documents submitted");
else bad("All lessor docs should be Submitted", lessorList1.map((r) => r.status).join(","));

await expectStatus("Lessor cannot review their own documents", 403,
  "PATCH", `/lessor-requirements/${lessorList1[0].id}/review`, { token: lessor, body: { status: "Approved" } });
await expectStatus("Lessor cannot reach staff-only lists", 403, "GET", "/owners", { token: lessor });

// ══════════════════════════════════════════════════════════════ D. OFFICER
section("D · LEASING OFFICER — approves the unit and opens the transaction");

step("Approves the submitted unit");
const approvedUnit = await api("PATCH", `/units/${draft.id}/approve`, { token: officer });
if (approvedUnit.approvalStatus === "APPROVED") ok("Officer approved the unit");
else bad("Unit should be APPROVED", approvedUnit.approvalStatus);
await expectStatus("An already-approved unit cannot be re-decided", 409,
  "PATCH", `/units/${draft.id}/approve`, { token: officer });

step("Reviews the lessor's checklist");
const forOwner = await api("GET", `/lessor-requirements/${apprLessor.unitOwnerId}`, { token: officer });
for (const r of forOwner.filter((x) => x.id)) {
  await api("PATCH", `/lessor-requirements/${r.id}/review`, { token: officer, body: { status: "Approved", remarks: "Verified" } });
}
const forOwner2 = await api("GET", `/lessor-requirements/${apprLessor.unitOwnerId}`, { token: officer });
if (forOwner2.every((r) => r.status === "Approved")) ok("Officer approved all seven lessor documents");
else bad("All lessor docs should be Approved", forOwner2.map((r) => r.status).join(","));

step("Takes the lessee inquiry from the pool");
const inqList = await api("GET", "/inquiries", { token: officer });
ok("Officer sees their own inquiries plus the unassigned pool", `${inqList.length} visible`);
const accepted = await api("PATCH", `/inquiries/${lesseeInq.id}/accept`, { token: officer });
ok("Officer accepted the inquiry", `assigned to ${accepted.assignedTo?.name ?? "?"}`);

const txns = await api("GET", "/leasing-transactions", { token: officer });
const txn = txns.find((t) => t.inquiryId === lesseeInq.id);
if (txn && /^RBU-\d{4}-\d{6}$/.test(txn.reference)) {
  ok("Accepting auto-created the transaction", `${txn.reference} @ ${txn.stage}/${txn.status}`);
} else bad("Transaction should be auto-created on accept");

// A second officer must not be able to steal it.
const officer2Cred = { email: `officer2.${S}`, password: "officer12345" };
await api("POST", "/auth/register", { token: adminToken, body: { name: "Officer Two", ...officer2Cred, role: "LEASING_OFFICER" } });
const officer2 = (await api("POST", "/auth/login", { body: officer2Cred })).token;
await expectStatus("Another officer cannot accept an already-taken inquiry", 409,
  "PATCH", `/inquiries/${lesseeInq.id}/accept`, { token: officer2 });
await expectStatus("An officer cannot release someone else's inquiry", 409,
  "PATCH", `/inquiries/${lesseeInq.id}/release`, { token: officer2 });

step("Links the unit, lessee and lessor onto the transaction");
const linked = await api("PATCH", `/leasing-transactions/${txn.id}/link`, {
  token: officer, body: { unitId: draft.id, tenantId: apprLessee.tenantId, unitOwnerId: apprLessor.unitOwnerId },
});
if (linked.unitId && linked.tenantId && linked.unitOwnerId) ok("All three records linked");
else bad("Link should set all three ids");
await expectStatus("Linking a non-existent record is refused", 400,
  "PATCH", `/leasing-transactions/${txn.id}/link`, { token: officer, body: { unitId: "does-not-exist" } });

// ═══════════════════════════════════════════════════════════════ E. LESSEE
section("E · LESSEE (TENANT) — submits their file and watches progress");

const lessee = (await api("POST", "/auth/login", { body: lesseeCred })).token;
ok("Lessee can sign in once approved");

step("Browses available units from inside the portal");
const browse = await api("GET", "/public/units");
ok("Lessee sees the published listings without logging out", `${browse.length} unit(s)`);

step("Works the seven-document lessee checklist");
const lesseeList0 = await api("GET", "/lessee-requirements/mine", { token: lessee });
if (lesseeList0.length === 7 && lesseeList0.every((r) => r.status === "Required")) {
  ok("Checklist reads as the full seven types before anything is uploaded");
} else bad("Lessee checklist should synthesize 7 Required rows", `${lesseeList0.length} rows`);

for (const key of LESSEE_KEYS) {
  await api("POST", `/lessee-requirements/mine/${key}`, { token: lessee, form: pdf(`${key.toLowerCase()}.pdf`) });
}
const lesseeList1 = await api("GET", "/lessee-requirements/mine", { token: lessee });
if (lesseeList1.every((r) => r.status === "Submitted")) ok("All seven lessee documents submitted");
else bad("All lessee docs should be Submitted", lesseeList1.map((r) => r.status).join(","));

step("Officer rejects one; the lessee resubmits");
const govId = lesseeList1.find((r) => r.requirementKey === "GOV_ID");
await api("PATCH", `/lessee-requirements/${govId.id}/review`, { token: officer, body: { status: "Rejected", remarks: "Expired ID" } });
const afterReject = (await api("GET", "/lessee-requirements/mine", { token: lessee })).find((r) => r.requirementKey === "GOV_ID");
if (afterReject.status === "Rejected" && afterReject.remarks === "Expired ID") ok("Rejection and remark reach the lessee");
else bad("Lessee should see the rejection remark", JSON.stringify(afterReject));

const resub = await api("POST", "/lessee-requirements/mine/GOV_ID", { token: lessee, form: pdf("gov_id_v2.pdf") });
if (resub.status === "Submitted" && resub.remarks === null && resub.reviewedAt === null) {
  ok("Resubmitting clears the prior review", "no stale rejection beside a fresh file");
} else bad("Resubmit should clear the review", JSON.stringify(resub));

for (const r of await api("GET", `/lessee-requirements/${apprLessee.tenantId}`, { token: officer })) {
  if (r.id) await api("PATCH", `/lessee-requirements/${r.id}/review`, { token: officer, body: { status: "Approved" } });
}
ok("Officer approved the lessee's file");

step("Scoping between parties");
await expectStatus("Lessee cannot read another tenant's checklist", 403,
  "GET", `/lessee-requirements/${apprLessee.tenantId}`, { token: lessee });
await expectStatus("Lessee cannot review documents", 403,
  "PATCH", `/lessee-requirements/${govId.id}/review`, { token: lessee, body: { status: "Approved" } });
await expectStatus("Lessee cannot reach the lessor checklist", 403, "GET", "/lessor-requirements/mine", { token: lessee });

const mine = await api("GET", "/leasing-transactions/mine", { token: lessee });
if (mine.length === 1 && mine[0].id === txn.id) ok("Lessee sees only their own transaction");
else bad("Lessee /mine should return exactly their transaction", `${mine.length} rows`);

// ═════════════════════════════════════════════════════ F. THE SEVEN STAGES
section("F · THE PIPELINE — officer walks all seven stages");

const setStatus = (status) => api("PATCH", `/leasing-transactions/${txn.id}/status`, { token: officer, body: { status } });
const advance = () => api("PATCH", `/leasing-transactions/${txn.id}/advance`, { token: officer, body: {} });
const readTxn = () => api("GET", `/leasing-transactions/${txn.id}`, { token: officer });

step("2 · Send Requirements → Complete");
await setStatus("Complete"); await advance();
let t = await readTxn();
if (t.stage === "APPROVAL") ok("Advanced to Approval", `${t.stage}/${t.status}`);
else bad("Should be at APPROVAL", t.stage);

step("3 · Approval — the four-step routing chain");
const steps = await api("GET", `/leasing-transactions/${txn.id}/approval-steps`, { token: officer });
if (steps.length === 4) ok("Routing chain created", steps.map((s) => s.name).join(" → "));
else bad("Should have 4 approval steps", `${steps.length}`);

await expectStatus("Approving out of order is refused", 409,
  "PATCH", `/leasing-transactions/${txn.id}/approval-steps/${steps[2].id}`, { token: officer, body: { status: "Approved" } });

for (const s of steps) {
  await api("PATCH", `/leasing-transactions/${txn.id}/approval-steps/${s.id}`, { token: officer, body: { status: "Approved", remarks: "OK" } });
}
t = await readTxn();
if (t.status === "Approved") ok("All four steps approved, stage recomputed to Approved");
else bad("Approval stage should read Approved", t.status);
await advance();

step("4 · Unit Inspection — scheduled, then completed with an outcome");
let appt = await api("POST", `/appointments/transaction/${txn.id}/UNIT_INSPECTION`, {
  token: officer, body: { scheduledAt: new Date(Date.now() + 864e5).toISOString(), location: "Unit 15-08" },
});
t = await readTxn();
if (t.status === "Scheduled") ok("Scheduling wrote through to the stage status");
else bad("Stage should read Scheduled", t.status);

await expectStatus("A non-schedulable stage is refused", 400,
  "POST", `/appointments/transaction/${txn.id}/APPROVAL`, { token: officer, body: { scheduledAt: new Date().toISOString() } });
await expectStatus("An invalid outcome for the stage is refused", 400,
  "PATCH", `/appointments/${appt.id}/complete`, { token: officer, body: { outcome: "Signed" } });

await api("PATCH", `/appointments/${appt.id}/complete`, { token: officer, body: { outcome: "Passed with Remarks" } });
t = await readTxn();
if (t.status === "Passed with Remarks") ok("Completion wrote its outcome into the stage");
else bad("Stage should carry the outcome", t.status);
await expectStatus("A completed appointment cannot be rescheduled", 409,
  "PATCH", `/appointments/${appt.id}/reschedule`, { token: officer, body: { scheduledAt: new Date().toISOString() } });
await advance();

step("5 · Key Turnover");
appt = await api("POST", `/appointments/transaction/${txn.id}/KEY_TURNOVER`, {
  token: officer, body: { scheduledAt: new Date(Date.now() + 1728e5).toISOString(), location: "Admin office" },
});
await api("PATCH", `/appointments/${appt.id}/complete`, { token: officer, body: {} });
t = await readTxn();
if (t.status === "Completed") ok("Turnover completed", `${t.stage}/${t.status}`);
else bad("Turnover should be Completed", t.status);
await advance();

step("6 · Photoshoot — and the Awaiting Prospect resting state");
// Unlink the tenant so the shoot finishes with nobody in view.
await api("PATCH", `/leasing-transactions/${txn.id}/link`, { token: officer, body: { tenantId: null } });
appt = await api("POST", `/appointments/transaction/${txn.id}/PHOTOSHOOT`, {
  token: officer, body: { scheduledAt: new Date(Date.now() + 2592e5).toISOString() },
});
await api("PATCH", `/appointments/${appt.id}/complete`, { token: officer, body: {} });
t = await readTxn();
if (t.status === "Awaiting Prospect") ok("Shoot done with no prospect rests at Awaiting Prospect");
else bad("Should rest at Awaiting Prospect", t.status);
const shootAppt = (await api("GET", `/appointments/transaction/${txn.id}`, { token: officer })).find((a) => a.stage === "PHOTOSHOOT");
if (shootAppt.status === "Completed" && shootAppt.outcome === "Completed") ok("The appointment itself still reads Completed");
else bad("Appointment should stay Completed", JSON.stringify(shootAppt));

await expectStatus("Cannot advance to signing with no prospect tenant", 409,
  "PATCH", `/leasing-transactions/${txn.id}/advance`, { token: officer, body: {} });

step("A prospect appears");
const relinked = await api("PATCH", `/leasing-transactions/${txn.id}/link`, { token: officer, body: { tenantId: apprLessee.tenantId } });
if (relinked.status === "Completed") ok("Linking a tenant clears Awaiting Prospect back to Completed");
else bad("Should return to Completed", relinked.status);

await expectStatus("Cannot advance to signing without the Letter of Intent", 409,
  "PATCH", `/leasing-transactions/${txn.id}/advance`, { token: officer, body: {} });

step("7 · Contract Signing — documents drive the pipeline");
const loiAsLessee = await upDoc(txn.id, lessee, "loi.pdf", "LETTER_OF_INTENT");
if (loiAsLessee.status === 403) ok("A lessee cannot upload a typed document", `403 "${loiAsLessee.data.error}"`);
else bad("Lessee typed upload should be 403", `${loiAsLessee.status}`);

const looseAsLessee = await upDoc(txn.id, lessee, "note.pdf", null);
if (looseAsLessee.status === 201) ok("A lessee can still add a loose attachment", "201");
else bad("Lessee loose upload should still work", `${looseAsLessee.status}`);

const badType = await upDoc(txn.id, officer, "x.pdf", "NOT_A_TYPE");
if (badType.status === 400) ok("An unknown document type is refused", `400 "${badType.data.error}"`);
else bad("Unknown docType should be 400", `${badType.status}`);

const loi = await upDoc(txn.id, officer, "letter-of-intent.pdf", "LETTER_OF_INTENT");
if (loi.status !== 201) bad("LOI upload failed", JSON.stringify(loi.data));
t = await readTxn();
if (t.stage === "CONTRACT_SIGNING" && t.status === "Pending" && t.finalStatus === "Pending") {
  ok("Uploading the LOI advanced the transaction into Contract Signing", `${t.stage}/${t.status}`);
} else bad("LOI should auto-advance to CONTRACT_SIGNING", `${t.stage}/${t.status}`);

const docsAfterLoi = (await readTxn()).documents || [];
if (docsAfterLoi.some((d) => d.docType === "LETTER_OF_INTENT")) ok("docType survives the read path (the C-1 regression)");
else bad("Read path must return docType", JSON.stringify(docsAfterLoi.map((d) => d.docType)));

await expectStatus("Cannot unlink the tenant once at Contract Signing", 409,
  "PATCH", `/leasing-transactions/${txn.id}/link`, { token: officer, body: { tenantId: null } });

const contract = await upDoc(txn.id, officer, "signed-contract.pdf", "SIGNED_CONTRACT");
if (contract.status !== 201) bad("Contract upload failed", JSON.stringify(contract.data));
t = await readTxn();
if (t.status === "Signed" && t.finalStatus === "Signed") ok("Uploading the signed contract closed the transaction", `finalStatus=${t.finalStatus}`);
else bad("Should close as Signed", `${t.status}/${t.finalStatus}`);

await expectStatus("Cannot advance past the final stage", 409,
  "PATCH", `/leasing-transactions/${txn.id}/advance`, { token: officer, body: {} });

step("Re-uploading a typed document replaces rather than stacks");
await upDoc(txn.id, officer, "signed-contract-v2.pdf", "SIGNED_CONTRACT");
const finalDocs = (await readTxn()).documents || [];
const contracts = finalDocs.filter((d) => d.docType === "SIGNED_CONTRACT");
if (contracts.length === 1 && contracts[0].filename === "signed-contract-v2.pdf") ok("Typed slot replaced in place", "1 row, newest file");
else bad("Typed doc should replace", `${contracts.length} rows`);

// ═══════════════════════════════════════════════════════════════ G. VIEWER
section("G · VIEWER — read-only staff");

const dash = await api("GET", "/dashboard/executive", { token: viewer });
ok("Viewer can read the executive dashboard", `${dash.all?.length ?? "?"} units tracked`);
const vTxns = await api("GET", "/leasing-transactions", { token: viewer });
ok("Viewer sees transactions unscoped", `${vTxns.length} visible`);
await api("GET", "/owners", { token: viewer });
await api("GET", "/tenants", { token: viewer });
ok("Viewer can read owners and tenants");

await expectStatus("Viewer cannot advance a transaction", 403,
  "PATCH", `/leasing-transactions/${txn.id}/advance`, { token: viewer, body: {} });
await expectStatus("Viewer cannot approve a unit", 403, "PATCH", `/units/${draft.id}/approve`, { token: viewer });
await expectStatus("Viewer cannot create a tenant", 403, "POST", "/tenants", { token: viewer, body: { name: "X" } });
await expectStatus("Viewer cannot review documents", 403,
  "PATCH", `/lessee-requirements/${govId.id}/review`, { token: viewer, body: { status: "Approved" } });
const viewerTyped = await upDoc(txn.id, viewer, "v.pdf", "LETTER_OF_INTENT");
if (viewerTyped.status === 403) ok("Viewer cannot upload a typed document", "403");
else bad("Viewer typed upload should be 403", `${viewerTyped.status}`);

// ══════════════════════════════════════════════════════════════ H. SUMMARY
section("SUMMARY");
log(`\n  Transaction ${txn.reference}`);
const done = await readTxn();
log(`  Final: ${done.stage} / ${done.status}  ·  finalStatus=${done.finalStatus}`);
log(`  Stages recorded: ${Object.keys(done.stageData || {}).length}/7`);
log(`  Documents on file: ${(done.documents || []).length}  (${(done.documents || []).map((d) => d.docType || "loose").join(", ")})`);
log(`  Event log entries: ${(done.events || []).length}`);

log(`\n  ${pass} passed, ${fail} failed, ${pass + fail} checks total\n`);
if (fail) {
  log("  FAILURES:");
  for (const r of results.filter((x) => !x.ok)) log(`   ·  ${r.label} — ${r.detail}`);
  log("");
}
process.exit(fail ? 1 : 0);
