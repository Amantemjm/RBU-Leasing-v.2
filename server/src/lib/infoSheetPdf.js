import PDFDocument from "pdfkit";
import { fieldsOf } from "./infoSheetSchema.js";

// Stream an info-sheet PDF (RBU/OCLP header, config sections, label:value rows,
// two signature lines) to an Express response. Works for any sheet config.
export function streamInfoSheetPdf({ title, config, data = {} }, res) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // Header
  doc.fontSize(9).fillColor("#5d7269")
    .text("Ortigas and Company, Limited Partnership (OCLP) — RBU Leasing", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(16).fillColor("#103a2b").text(title, { align: "center" });
  doc.moveDown(0.2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cddbd3").stroke();
  doc.moveDown(0.8);

  for (const section of config.sections) {
    doc.fontSize(11).fillColor("#17624a").text(section.title, { underline: false });
    doc.moveDown(0.2);
    for (const f of section.fields) {
      const raw = data[f.key];
      const value = raw === undefined || raw === null || raw === "" ? "—" : String(raw);
      doc.fontSize(9.5).fillColor("#5d7269").text(`${f.label}: `, { continued: true });
      doc.fillColor("#16241d").text(value);
    }
    doc.moveDown(0.6);
  }

  // Signature lines
  doc.moveDown(1.5);
  const y = doc.y;
  doc.strokeColor("#16241d");
  doc.moveTo(60, y).lineTo(250, y).stroke();
  doc.moveTo(320, y).lineTo(510, y).stroke();
  doc.fontSize(9).fillColor("#5d7269");
  doc.text("Signature over printed name", 60, y + 5, { width: 190, align: "center" });
  doc.text("Received by (RBU Leasing)", 320, y + 5, { width: 190, align: "center" });

  doc.end();
  return doc;
}

// Field list re-export for callers that need it.
export { fieldsOf };
