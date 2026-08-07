export function rowOffset(firstCell) {
  return typeof firstCell === "number" ? 1 : 0;
}

const NULLISH = new Set(["", "-", "n/a", "na", "none"]);

export function text(v) {
  if (v == null) return null;
  let s = typeof v === "object" && v.text ? v.text : String(v);
  s = s.trim();
  if (NULLISH.has(s.toLowerCase())) return null;
  return s || null;
}

export function money(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/php/gi, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function toDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function leaseStatus(endDate, now) {
  return endDate.getTime() >= now.getTime() ? "ACTIVE" : "EXPIRED";
}

export function key(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
