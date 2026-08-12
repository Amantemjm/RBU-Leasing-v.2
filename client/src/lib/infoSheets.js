import { api } from "./api.js";

export function listInfoSheets() {
  return api.get("/info-sheets").then((r) => r.data);
}
export function getInfoSheet(id) {
  return api.get(`/info-sheets/${id}`).then((r) => r.data);
}
export function createInfoSheet(unitOwnerId) {
  return api.post("/info-sheets", { unitOwnerId }).then((r) => r.data);
}
export function submitInfoSheet(id, data) {
  return api.patch(`/info-sheets/${id}/submit`, data).then((r) => r.data);
}
export function reviewInfoSheet(id, data) {
  return api.patch(`/info-sheets/${id}/review`, data).then((r) => r.data);
}
