import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const GREEN = "FF1A5632", GREY = "FFF1F3F2";

function sheet(wb, name, cols, rows, opts = {}) {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w }));
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  hr.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  rows.forEach((r) => ws.addRow(r));
  const rentCol = cols.findIndex((c) => c.money) + 1;
  if (rentCol > 0) ws.getColumn(rentCol).numFmt = "#,##0";
  for (let r = 2; r <= ws.rowCount; r++) {
    if (r % 2 === 0) ws.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
  }
  if (opts.flag) {
    const col = cols.findIndex((c) => c.k === opts.flag.key) + 1;
    for (let r = 2; r <= ws.rowCount; r++) {
      const v = ws.getRow(r).getCell(col).value;
      if (typeof v === "number" && opts.flag.test(v)) ws.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.flag.argb } };
    }
  }
  return ws;
}

export async function buildExecutiveExcel(data) {
  const s = data.summary;
  const wb = new ExcelJS.Workbook();
  wb.creator = "RBU Leasing";

  const ex = wb.addWorksheet("Executive Summary");
  ex.getCell("A1").value = "RBU Leasing — Executive Summary";
  ex.getCell("A1").font = { bold: true, size: 16, color: { argb: GREEN } };
  ex.getCell("A3").value = `As of ${data.meta.asOf}`;
  ex.getCell("A3").font = { italic: true, color: { argb: "FF6B7280" } };
  const kpis = [
    ["Total Registered Units", s.totalUnits, null],
    ["Currently Leased", s.leased, null],
    ["Registered but Not Leased", s.notLeased, null],
    ["Near Expiry (<=90 days)", s.nearExpiry, null],
    ["Occupancy Rate", s.occupancyRate / 100, "0.0%"],
    ["Monthly Active Rent (PHP)", s.monthlyActiveRent, '"₱"#,##0'],
    ["Annualized Active Rent (PHP)", s.annualActiveRent, '"₱"#,##0'],
    ["Long-Vacant Units (>=180 days)", s.longVacant, null],
    ["Expiring <=30 days", s.buckets.within30, null],
    ["Expiring 31-60 days", s.buckets.within60, null],
    ["Expiring 61-90 days", s.buckets.within90, null],
  ];
  let row = 5;
  for (const [label, val, fmt] of kpis) {
    ex.getCell(`A${row}`).value = label; ex.getCell(`A${row}`).font = { bold: true };
    ex.getCell(`B${row}`).value = val; if (fmt) ex.getCell(`B${row}`).numFmt = fmt;
    row++;
  }
  ex.getColumn(1).width = 34; ex.getColumn(2).width = 20;

  sheet(wb, "All Registered Units", [
    { h: "Property", k: "property", w: 30 }, { h: "Unit", k: "unit", w: 10 }, { h: "Type", k: "type", w: 10 },
    { h: "Owner", k: "owner", w: 24 }, { h: "Tenant", k: "tenant", w: 24 },
    { h: "Lease Start", k: "start", w: 13 }, { h: "Lease End", k: "end", w: 13 },
    { h: "Monthly Rent", k: "monthlyRent", w: 15, money: true }, { h: "Status", k: "status", w: 12 },
    { h: "Days to Expiry", k: "daysToExpiry", w: 14 },
  ], data.all);

  sheet(wb, "Currently Leased", [
    { h: "Property", k: "property", w: 30 }, { h: "Unit", k: "unit", w: 10 }, { h: "Type", k: "type", w: 10 },
    { h: "Tenant", k: "tenant", w: 26 }, { h: "Lease Start", k: "start", w: 13 }, { h: "Lease End", k: "end", w: 13 },
    { h: "Monthly Rent", k: "monthlyRent", w: 15, money: true }, { h: "Days to Expiry", k: "daysToExpiry", w: 14 },
    { h: "Owner", k: "owner", w: 24 },
  ], data.leased);

  sheet(wb, "Near-Expiry Leases", [
    { h: "Property", k: "property", w: 30 }, { h: "Unit", k: "unit", w: 10 }, { h: "Tenant", k: "tenant", w: 26 },
    { h: "Lease Start", k: "start", w: 13 }, { h: "Lease Expiry", k: "end", w: 13 }, { h: "Remaining", k: "remaining", w: 14 },
    { h: "Days to Expiry", k: "daysToExpiry", w: 14 }, { h: "Monthly Rent", k: "monthlyRent", w: 15, money: true },
    { h: "Recommended Action", k: "recommendedAction", w: 30 },
  ], data.nearExpiry, { flag: { key: "daysToExpiry", test: (v) => v <= 30, argb: "FFFBE4D5" } });

  sheet(wb, "Not Leased", [
    { h: "Property", k: "property", w: 30 }, { h: "Unit", k: "unit", w: 10 }, { h: "Type", k: "type", w: 10 },
    { h: "Owner", k: "owner", w: 24 }, { h: "Last Tenant", k: "tenant", w: 24 },
    { h: "Last Lease End", k: "lastLeaseEnd", w: 14 }, { h: "Days Unleased", k: "unleasedDays", w: 14 },
    { h: "Last Monthly Rate", k: "monthlyRent", w: 16, money: true }, { h: "Recommended Action", k: "recommendedAction", w: 30 },
  ], data.notLeased, { flag: { key: "unleasedDays", test: (v) => v >= 180, argb: "FFF7D6D2" } });

  sheet(wb, "Lease Details", [
    { h: "Property", k: "property", w: 30 }, { h: "Unit", k: "unit", w: 10 }, { h: "Tenant", k: "tenant", w: 26 },
    { h: "Lease Start", k: "start", w: 13 }, { h: "Lease End", k: "end", w: 13 },
    { h: "Monthly Rent", k: "monthlyRent", w: 15, money: true }, { h: "Status", k: "status", w: 12 }, { h: "Owner", k: "owner", w: 24 },
  ], data.leaseDetails || []);

  return wb.xlsx.writeBuffer();
}
