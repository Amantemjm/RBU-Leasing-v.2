import { z } from "zod";
import { buildWorkbook } from "../lib/excel.js";
import { periodRange } from "../services/summaryService.js";
import {
  rentRollRows, collectionsRows, leaseExpiryRows, ownerStatementRows,
} from "../services/reportService.js";

function sendXlsx(res, filename, buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

const collectionsQuery = z.object({
  period: z.enum(["month", "quarter", "year"]).optional(),
  date: z.coerce.date().optional(),
});
const expiryQuery = z.object({ days: z.coerce.number().int().positive().optional() });

export async function rentRoll(req, res, next) {
  try {
    const rows = await rentRollRows();
    const buffer = await buildWorkbook({
      sheetName: "Rent Roll",
      columns: [
        { header: "Tenant", key: "tenant", width: 24 },
        { header: "Unit", key: "unit" },
        { header: "Owner", key: "owner", width: 24 },
        { header: "Monthly Rent", key: "monthlyRent" },
        { header: "Start", key: "startDate" },
        { header: "End", key: "endDate" },
        { header: "Balance", key: "balance" },
      ],
      rows,
    });
    sendXlsx(res, "rent-roll.xlsx", buffer);
  } catch (e) { next(e); }
}

export async function collections(req, res, next) {
  try {
    const { period, date } = collectionsQuery.parse(req.query);
    const range = periodRange(period || "month", date || new Date());
    const rows = await collectionsRows(range);
    const buffer = await buildWorkbook({
      sheetName: "Collections",
      columns: [
        { header: "Paid Date", key: "paidDate" },
        { header: "Tenant", key: "tenant", width: 24 },
        { header: "Unit", key: "unit" },
        { header: "Amount", key: "amount" },
        { header: "Method", key: "method" },
      ],
      rows,
    });
    sendXlsx(res, "collections.xlsx", buffer);
  } catch (e) { next(e); }
}

export async function leaseExpiry(req, res, next) {
  try {
    const { days } = expiryQuery.parse(req.query);
    const rows = await leaseExpiryRows(new Date(), days || 90);
    const buffer = await buildWorkbook({
      sheetName: "Lease Expiry",
      columns: [
        { header: "Tenant", key: "tenant", width: 24 },
        { header: "Unit", key: "unit" },
        { header: "Owner", key: "owner", width: 24 },
        { header: "End Date", key: "endDate" },
        { header: "Days Remaining", key: "daysRemaining" },
        { header: "Monthly Rent", key: "monthlyRent" },
      ],
      rows,
    });
    sendXlsx(res, "lease-expiry.xlsx", buffer);
  } catch (e) { next(e); }
}

export async function ownerStatement(req, res, next) {
  try {
    const rows = await ownerStatementRows();
    const buffer = await buildWorkbook({
      sheetName: "Owner Statement",
      columns: [
        { header: "Owner", key: "owner", width: 28 },
        { header: "Units", key: "units" },
        { header: "Occupied", key: "occupied" },
        { header: "Occupancy Rate", key: "occupancyRate" },
        { header: "Gross Monthly Income", key: "grossMonthlyIncome", width: 20 },
      ],
      rows,
    });
    sendXlsx(res, "owner-statement.xlsx", buffer);
  } catch (e) { next(e); }
}
