import ExcelJS from "exceljs";

export async function buildWorkbook({ sheetName, columns, rows }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
