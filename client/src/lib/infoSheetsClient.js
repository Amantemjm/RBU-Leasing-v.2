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
    downloadPdf: (id, filename) => downloadBlob(`${base}/${id}/pdf`, filename),
    // Live preview: render the form from unsaved data. Returns raw PDF bytes.
    previewBytes: (data) =>
      api.post(`${base}/preview`, { data }, { responseType: "arraybuffer" }).then((r) => r.data),

    // --- upload & edit a PDF path ---
    savePdf: (id, fileOrBytes) =>
      api.patch(`${base}/${id}/pdf`, new Blob([fileOrBytes], { type: "application/pdf" }), {
        headers: { "Content-Type": "application/pdf" },
      }).then((r) => r.data),
    submitFilledPdf: (id, fileOrBytes) =>
      api.patch(`${base}/${id}/submit-pdf`, new Blob([fileOrBytes], { type: "application/pdf" }), {
        headers: { "Content-Type": "application/pdf" },
      }).then((r) => r.data),
    // Stored PDF bytes for the in-page editor (null if none yet).
    filledPdfBytes: async (id) => {
      try {
        const res = await api.get(`${base}/${id}/filled-pdf`, { responseType: "arraybuffer", params: { _: Date.now() } });
        return res.data;
      } catch (e) { if (e.response?.status === 404) return null; throw e; }
    },
    downloadFilledPdf: (id, filename) => downloadBlob(`${base}/${id}/filled-pdf`, filename),
    filledPdfUrl: async (id) => {
      const res = await api.get(`${base}/${id}/filled-pdf`, { responseType: "blob", params: { _: Date.now() } });
      return URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    },
  };
}

async function downloadBlob(path, filename) {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
