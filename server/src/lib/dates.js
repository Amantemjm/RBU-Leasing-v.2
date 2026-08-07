export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

export function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

export function startOfNextQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 1);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function startOfNextYear(d) {
  return new Date(d.getFullYear() + 1, 0, 1);
}
