import { api } from "./api.js";

export function listAudit() {
  return api.get("/audit").then((r) => r.data);
}
