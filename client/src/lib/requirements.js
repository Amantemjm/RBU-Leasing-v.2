import { api } from "./api.js";

export function listRequirements(params) {
  return api.get("/requirements", { params }).then((r) => r.data);
}

export function uploadRequirement(file) {
  const form = new FormData();
  form.append("file", file);
  return api.post("/requirements", form).then((r) => r.data);
}

export async function downloadRequirement(id, filename) {
  const res = await api.get(`/requirements/${id}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
