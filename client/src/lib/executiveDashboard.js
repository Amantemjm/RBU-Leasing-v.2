import { api } from "./api.js";

export function fetchExecutiveDashboard() {
  return api.get("/dashboard/executive").then((r) => r.data);
}

export async function downloadExecutiveExcel() {
  const res = await api.get("/dashboard/executive.xlsx", { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "RBU-Leasing-Executive-Report.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
