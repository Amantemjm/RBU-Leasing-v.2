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

// The four selectable roles, mapped to their underlying enum values.
export const ROLE_OPTIONS = [
  { value: "LEASING_OFFICER", label: "O-Lease" },
  { value: "UNIT_OWNER", label: "Lessor" },
  { value: "TENANT", label: "Lessee" },
  { value: "ADMIN", label: "Super Admin" },
];

export function roleLabel(value) {
  const found = ROLE_OPTIONS.find((r) => r.value === value);
  return found ? found.label : value;
}
