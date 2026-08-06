const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function formatPHP(amount) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return "";
  return php.format(n);
}

export function formatDate(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

export function toDateInput(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}
