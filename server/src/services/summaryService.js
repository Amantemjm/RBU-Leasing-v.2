import { prisma } from "../lib/prisma.js";
import {
  startOfMonth, startOfNextMonth,
  startOfQuarter, startOfNextQuarter,
  startOfYear, startOfNextYear,
  addDays,
} from "../lib/dates.js";

function num(value) {
  return value == null ? 0 : Number(value);
}

export function periodRange(type, anchor) {
  if (type === "quarter") return { start: startOfQuarter(anchor), end: startOfNextQuarter(anchor) };
  if (type === "year") return { start: startOfYear(anchor), end: startOfNextYear(anchor) };
  return { start: startOfMonth(anchor), end: startOfNextMonth(anchor) };
}

export function priorRange(type, anchor) {
  const { start } = periodRange(type, anchor);
  const priorAnchor = addDays(start, -1);
  return periodRange(type, priorAnchor);
}
