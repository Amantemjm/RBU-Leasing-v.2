const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function formatPHP(amount) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return "";
  return php.format(n);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Standard long date, e.g. "August 18, 2026". Parses the date part directly so
// it never shifts across timezones. Used for every displayed date in the app.
export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso).slice(0, 10);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
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
