import { api } from "./api.js";

export async function downloadReport(path, params, filename) {
  const res = await api.get(path, { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const reports = {
  rentRoll: () => downloadReport("/reports/rent-roll", {}, "rent-roll.xlsx"),
  collections: (period, date) => downloadReport("/reports/collections", { period, date }, "collections.xlsx"),
  leaseExpiry: (days) => downloadReport("/reports/lease-expiry", { days }, "lease-expiry.xlsx"),
  ownerStatement: () => downloadReport("/reports/owner-statement", {}, "owner-statement.xlsx"),
};
