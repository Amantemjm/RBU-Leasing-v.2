import axios from "axios";
import { api } from "./api.js";

// Public landing-page submission — intentionally uses a bare axios call so no
// auth token is ever attached.
export function createInquiry(payload) {
  return axios.post("/api/inquiries", payload).then((r) => r.data);
}

// Staff operations go through the authenticated client.
export function listInquiries() {
  return api.get("/inquiries").then((r) => r.data);
}
export function updateInquiryStatus(id, status) {
  return api.patch(`/inquiries/${id}`, { status }).then((r) => r.data);
}
export function assignInquiry(id, assignedToId) {
  return api.patch(`/inquiries/${id}/assign`, { assignedToId }).then((r) => r.data);
}
// O-Lease self-assign / release.
export function acceptInquiry(id) {
  return api.patch(`/inquiries/${id}/accept`).then((r) => r.data);
}
export function releaseInquiry(id) {
  return api.patch(`/inquiries/${id}/release`).then((r) => r.data);
}
export function deleteInquiry(id) {
  return api.delete(`/inquiries/${id}`).then((r) => r.data);
}
