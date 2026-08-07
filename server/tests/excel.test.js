import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel.js";

describe("buildWorkbook", () => {
  it("produces an xlsx buffer with a header row and one row per record", async () => {
    const buf = await buildWorkbook({
      sheetName: "Test",
      columns: [{ header: "Name", key: "name" }, { header: "Amount", key: "amount" }],
      rows: [{ name: "Ayala", amount: 100 }, { name: "SM", amount: 200 }],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 2).toString()).toBe("PK"); // xlsx is a zip

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Test");
    expect(ws.getRow(1).getCell(1).value).toBe("Name");
    expect(ws.getRow(1).getCell(2).value).toBe("Amount");
    expect(ws.getRow(2).getCell(1).value).toBe("Ayala");
    expect(ws.getRow(3).getCell(2).value).toBe(200);
    expect(ws.rowCount).toBe(3); // header + 2
  });
});
