import { api } from "./api.js";

export function fetchSummary(period, date) {
  return api.get("/summary", { params: { period, date } }).then((r) => r.data);
}
