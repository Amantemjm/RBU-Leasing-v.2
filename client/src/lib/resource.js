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
export function ownerMe() { return api.get("/owners/me").then((r) => r.data); }
export function tenantMe() { return api.get("/tenants/me").then((r) => r.data); }
export const units = resource("/units");
export const tenants = resource("/tenants");
export const leases = resource("/leases");
export const estates = resource("/estates");
export const towers = resource("/towers");

export function assignOwner(id, assignedOfficerId) {
  return api.patch(`/owners/${id}/assign`, { assignedOfficerId }).then((r) => r.data);
}
export function approveUnit(id) {
  return api.patch(`/units/${id}/approve`).then((r) => r.data);
}
export function rejectUnit(id) {
  return api.patch(`/units/${id}/reject`).then((r) => r.data);
}
export function createUser(payload) {
  return api.post("/auth/register", payload).then((r) => r.data);
}
export function listUsers() {
  return api.get("/auth/users").then((r) => r.data);
}
export function updateUser(id, payload) {
  return api.patch(`/auth/users/${id}`, payload).then((r) => r.data);
}
export function deleteUser(id) {
  return api.delete(`/auth/users/${id}`).then((r) => r.data);
}
