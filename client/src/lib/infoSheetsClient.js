import { api } from "./api.js";

// Shared client factory for a config-driven info-sheet route group.
export function makeInfoSheetsClient(base, fkField) {
  return {
    config: () => api.get(`${base}/config`).then((r) => r.data),
    list: () => api.get(base).then((r) => r.data),
    get: (id) => api.get(`${base}/${id}`).then((r) => r.data),
    create: (parentId) => api.post(base, { [fkField]: parentId }).then((r) => r.data),
    submit: (id, data) => api.patch(`${base}/${id}/submit`, { data }).then((r) => r.data),
    review: (id, payload) => api.patch(`${base}/${id}/review`, payload).then((r) => r.data),
    downloadPdf: async (id, filename) => {
      const res = await api.get(`${base}/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  };
}
