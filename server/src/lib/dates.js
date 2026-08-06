export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}
