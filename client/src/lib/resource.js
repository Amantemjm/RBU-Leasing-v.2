import { api } from "./api.js";

export function resource(path) {
  return {
    list: (params) => api.get(path, { params }).then((r) => r.data),
    get: (id) => api.get(`${path}/${id}`).then((r) => r.data),
    create: (data) => api.post(path, data).then((r) => r.data),
    update: (id, data) => api.patch(`${path}/${id}`, data).then((r) => r.data),
    remove: (id) => api.delete(`${path}/${id}`).then((r) => r.data),
  };
}

export const owners = resource("/owners");
owners.profile = (id) => api.get(`/owners/${id}/profile`).then((r) => r.data);
export function ownerMe() { return api.get("/owners/me").then((r) => r.data); }
export function tenantMe() { return api.get("/tenants/me").then((r) => r.data); }
export const units = resource("/units");
export const tenants = resource("/tenants");
export const leases = resource("/leases");
export const estates = resource("/estates");
export const towers = resource("/towers");
export const cmsForms = resource("/cms/forms");

// CMS page-form slots (Super Admin configures a field set per role + nav page).
export const pageForms = {
  list: () => api.get("/cms/page-forms").then((r) => r.data),
  get: (role, pageKey) => api.get(`/cms/page-forms/${role}/${pageKey}`).then((r) => r.data),
  save: (role, pageKey, data) => api.put(`/cms/page-forms/${role}/${pageKey}`, data).then((r) => r.data),
  remove: (role, pageKey) => api.delete(`/cms/page-forms/${role}/${pageKey}`).then((r) => r.data),
  entries: (role, pageKey) => api.get(`/cms/page-forms/${role}/${pageKey}/entries`).then((r) => r.data),
};

// The signed-in user's own view of a page form (the fields configured for their
// role + the page they're on, and their saved answers).
export const myPageForm = {
  get: (pageKey) => api.get(`/page-forms/mine/${pageKey}`).then((r) => r.data),
  save: (pageKey, data) => api.put(`/page-forms/mine/${pageKey}`, { data }).then((r) => r.data),
};

// Leasing process tracker — one shared transaction per leasing deal.
export const leasingTransactions = {
  list: () => api.get("/leasing-transactions").then((r) => r.data),
  get: (id) => api.get(`/leasing-transactions/${id}`).then((r) => r.data),
  create: (data) => api.post("/leasing-transactions", data).then((r) => r.data),
  setStatus: (id, data) => api.patch(`/leasing-transactions/${id}/status`, data).then((r) => r.data),
  advance: (id, data) => api.patch(`/leasing-transactions/${id}/advance`, data || {}).then((r) => r.data),
  returnStage: (id, data) => api.patch(`/leasing-transactions/${id}/return`, data || {}).then((r) => r.data),
  link: (id, data) => api.patch(`/leasing-transactions/${id}/link`, data).then((r) => r.data),
  remove: (id) => api.delete(`/leasing-transactions/${id}`).then((r) => r.data),
  mine: () => api.get("/leasing-transactions/mine").then((r) => r.data),
  getMine: (id) => api.get(`/leasing-transactions/mine/${id}`).then((r) => r.data),
  // supporting documents
  uploadDocument: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/leasing-transactions/${id}/documents`, form).then((r) => r.data);
  },
  deleteDocument: (id, docId) => api.delete(`/leasing-transactions/${id}/documents/${docId}`).then((r) => r.data),
  async downloadDocument(id, docId, filename) {
    const res = await api.get(`/leasing-transactions/${id}/documents/${docId}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
  // approval routing
  approvalSteps: (id) => api.get(`/leasing-transactions/${id}/approval-steps`).then((r) => r.data),
  decideStep: (id, stepId, data) => api.patch(`/leasing-transactions/${id}/approval-steps/${stepId}`, data).then((r) => r.data),
};

export function assignOwner(id, assignedOfficerId) {
  return api.patch(`/owners/${id}/assign`, { assignedOfficerId }).then((r) => r.data);
}
export function approveUnit(id) {
  return api.patch(`/units/${id}/approve`).then((r) => r.data);
}
export function rejectUnit(id, remarks) {
  return api.patch(`/units/${id}/reject`, { remarks }).then((r) => r.data);
}
export function submitUnit(id) {
  return api.patch(`/units/${id}/submit`).then((r) => r.data);
}
export function createUser(payload) {
  return api.post("/auth/register", payload).then((r) => r.data);
}
// Account approval queue — portal self-signups awaiting an ADMIN or O-Lease
// decision. Approving is what creates the linked Owner/Tenant record.
export const pendingAccounts = {
  list: () => api.get("/auth/pending").then((r) => r.data),
  approve: (id) => api.patch(`/auth/pending/${id}/approve`).then((r) => r.data),
  reject: (id, reason) => api.patch(`/auth/pending/${id}/reject`, { reason }).then((r) => r.data),
};

export function listUsers() {
  return api.get("/auth/users").then((r) => r.data);
}
export function updateUser(id, payload) {
  return api.patch(`/auth/users/${id}`, payload).then((r) => r.data);
}
export function deleteUser(id) {
  return api.delete(`/auth/users/${id}`).then((r) => r.data);
}

export const appointments = {
  forTransaction: (txnId) => api.get(`/appointments/transaction/${txnId}`).then((r) => r.data),
  mine: () => api.get("/appointments/mine").then((r) => r.data),
  schedule: (txnId, stage, body) => api.post(`/appointments/transaction/${txnId}/${stage}`, body).then((r) => r.data),
  reschedule: (id, body) => api.patch(`/appointments/${id}/reschedule`, body).then((r) => r.data),
  complete: (id, body) => api.patch(`/appointments/${id}/complete`, body).then((r) => r.data),
  cancel: (id, body) => api.patch(`/appointments/${id}/cancel`, body).then((r) => r.data),
};

export const lessorRequirements = {
  mine: () => api.get("/lessor-requirements/mine").then((r) => r.data),
  forOwner: (id) => api.get(`/lessor-requirements/${id}`).then((r) => r.data),
  uploadMine: (key, file) => {
    const form = new FormData(); form.append("file", file);
    return api.post(`/lessor-requirements/mine/${key}`, form).then((r) => r.data);
  },
  uploadFor: (ownerId, key, file) => {
    const form = new FormData(); form.append("file", file);
    return api.post(`/lessor-requirements/${ownerId}/${key}`, form).then((r) => r.data);
  },
  review: (id, body) => api.patch(`/lessor-requirements/${id}/review`, body).then((r) => r.data),
  download: async (id) => {
    const res = await api.get(`/lessor-requirements/${id}/download`, { responseType: "blob" });
    return res.data;
  },
};
