import PDFDocument from "pdfkit";

// Renders the official O-Lease "Unit Owner Information Sheet • Registration"
// form as a pixel-faithful 2-page PDF. Two modes share one layout:
//   mode "filled"   — static text/ticks from a submitted sheet's data
//   mode "fillable" — blank interactive AcroForm (real text fields + checkboxes)
//                     the lessor fills directly in a PDF viewer.

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 40;
const MARGIN_B = 34;
const X0 = MARGIN;
const X1 = PAGE.w - MARGIN;
const W = X1 - X0; // ~515
const C4 = W / 4;
const TOP = 44;

const BORDER = "#B7B7B7";
const LABEL_BG = "#F2F2F2";
const BAR_BG = "#D9D9D9";
const TEXT = "#1A1A1A";
const MUTED = "#666666";
const TEAL = "#2E6B5E";
const FIELD_BG = "#FBFDFC"; // faint tint so blank fields are discoverable

function fmtDate(v) {
  if (!v) return "";
  const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(v);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

// AcroForm-safe field name from a config key (+ option).
const fname = (k, opt) => (opt != null ? `${k}__${opt}` : String(k)).replace(/[^A-Za-z0-9]+/g, "_");

// The shared layout. `mode` selects static vs. interactive rendering.
function render(doc, { mode, data = {} }) {
  const fillable = mode === "fillable";
  if (fillable) doc.initForm();

  const d = (k) => { const v = data[k]; return v === undefined || v === null ? "" : v; };
  const has = (k, opt) => { const v = data[k]; return Array.isArray(v) ? v.includes(opt) : v === opt; };

  let y = TOP;
  let pageNo = 1;

  const fillRect = (x, w, h, color) => { doc.save().rect(x, y, w, h).fillColor(color).fill().restore(); };
  const strokeRect = (x, w, h) => { doc.save().rect(x, y, w, h).lineWidth(0.7).strokeColor(BORDER).stroke().restore(); };

  function footer() {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(String(pageNo), X0, PAGE.h - 26, { width: W, align: "right" });
  }
  function newPage() { footer(); doc.addPage(); pageNo++; y = TOP; }
  function ensure(h) { if (y + h > PAGE.h - MARGIN_B) newPage(); }

  function cellText(x, w, h, text, opts = {}) {
    const { bold = false, size = 9, color = TEXT, align = "left" } = opts;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
    const ty = y + Math.max(3, (h - size) / 2 - 1);
    doc.text(text == null ? "" : String(text), x + 5, ty, { width: w - 10, height: h - 4, align, lineBreak: false, ellipsis: true });
  }

  // A value cell: static text (filled) or an interactive text field (fillable).
  // The field is inset inside the cell and borderless, so the cell's own border
  // is the only box — the field never doubles or overlaps it.
  function valueCell(x, w, h, key, { multiline = false, align = "left" } = {}) {
    if (!fillable) { cellText(x, w, h, d(key), { align }); return; }
    doc.formText(fname(key), x + 3, y + 3, w - 6, h - 6, {
      align, fontSize: multiline ? 8.5 : 9, multiline,
      backgroundColor: FIELD_BG, borderWidth: 0,
    });
  }

  // A tick-box. Filled mode draws a static square (+check when on). Fillable mode
  // renders ONLY the interactive checkbox widget (its own border is the box), so
  // there is never a static square overlapping the widget.
  const BOX = 9;
  function square(x, cy) { doc.save().rect(x, cy, BOX, BOX).lineWidth(0.8).strokeColor("#555").stroke().restore(); }
  function drawCheck(x, cy) {
    doc.save().moveTo(x + 1.6, cy + 4.4).lineTo(x + 3.5, cy + 7).lineTo(x + 7.5, cy + 1.6)
      .lineWidth(1.2).strokeColor(TEAL).stroke().restore();
  }
  function tickBox(x, cy, key, opt) {
    if (fillable) doc.formCheckbox(fname(key, opt), x, cy, BOX, BOX, { borderColor: "#666", borderWidth: 0.8, backgroundColor: FIELD_BG });
    else { square(x, cy); if (has(key, opt)) drawCheck(x, cy); }
  }

  const LBL = 6 + BOX + 4; // label offset from cell edge: gutter + box + gap
  // Vertically-stacked tick list inside a cell.
  function checkStack(x, w, cy, key, options, other) {
    let yy = cy;
    doc.font("Helvetica").fontSize(8.5);
    for (const opt of options) {
      tickBox(x + 6, yy, key, opt);
      doc.fillColor(!fillable && has(key, opt) ? TEAL : TEXT).text(opt, x + LBL, yy, { width: w - LBL - 4, lineBreak: false, ellipsis: true });
      yy += 13;
    }
    if (other) {
      const on = !fillable && !!d(`${key}Other`);
      if (fillable) doc.formCheckbox(fname(`${key}OtherChk`), x + 6, yy, BOX, BOX, { borderColor: "#666", borderWidth: 0.8, backgroundColor: FIELD_BG });
      else { square(x + 6, yy); if (on) drawCheck(x + 6, yy); }
      const lbl = other.label ? `${other.label}:` : "";
      let lx = x + LBL;
      if (lbl) { doc.fillColor(TEXT).text(lbl, lx, yy, { lineBreak: false }); lx += doc.widthOfString(lbl) + 4; }
      if (fillable) doc.formText(fname(`${key}Other`), lx, yy - 1.5, x + w - lx - 4, 11, { fontSize: 8.5, backgroundColor: FIELD_BG, borderWidth: 0 });
      else doc.fillColor(TEXT).text(d(`${key}Other`) || "____________", lx, yy, { lineBreak: false });
    }
  }

  // Horizontal (inline) tick list inside a cell.
  function checkRow(x, w, cy, key, options, other) {
    let cx = x + 6;
    doc.font("Helvetica").fontSize(8.5);
    for (const opt of options) {
      const need = (BOX + 4) + doc.widthOfString(opt) + 10;
      if (cx + need > x + w) { cx = x + 6; cy += 13; }
      tickBox(cx, cy, key, opt);
      doc.fillColor(!fillable && has(key, opt) ? TEAL : TEXT).text(opt, cx + BOX + 4, cy, { lineBreak: false });
      cx += need;
    }
    if (other) {
      const on = !fillable && !!d(`${key}Other`);
      if (fillable) doc.formCheckbox(fname(`${key}OtherChk`), cx, cy, BOX, BOX, { borderColor: "#666", borderWidth: 0.8, backgroundColor: FIELD_BG });
      else { square(cx, cy); if (on) drawCheck(cx, cy); }
      const lx = cx + BOX + 4;
      if (fillable) doc.formText(fname(`${key}Other`), lx, cy - 1.5, Math.max(24, x + w - lx - 4), 11, { fontSize: 8.5, backgroundColor: FIELD_BG, borderWidth: 0 });
      else doc.fillColor(TEXT).text(d(`${key}Other`) || "________", lx, cy, { lineBreak: false });
    }
  }

  // A row of N cells. Cell: { w, label?, valueKey?, multiline?, bg?, draw? }.
  function row(h, cells) {
    ensure(h);
    let x = X0;
    for (const c of cells) {
      const w = c.w;
      if (c.bg) fillRect(x, w, h, c.bg);
      strokeRect(x, w, h);
      if (c.draw) c.draw(x, w, h);
      else if (c.label != null) cellText(x, w, h, c.label, { bold: true, size: 8.5 });
      else if (c.valueKey != null) valueCell(x, w, h, c.valueKey, { multiline: c.multiline });
      x += w;
    }
    y += h;
  }

  const bar = (label) => row(15, [{ w: W, label, bg: BAR_BG }]);
  function sectionHead(label) {
    ensure(26); y += 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT).text(label, X0, y);
    y += 16;
  }

  // ======================= HEADER (page 1) ==============================
  doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT)
    .text("Unit Owner Information Sheet • Registration", X0, 52, { width: 400 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(TEAL).text("O–L", X1 - 90, 46, { width: 90, align: "center" });
  doc.font("Helvetica").fontSize(20).fillColor(TEAL).text("O-Lease", X1 - 120, 74, { width: 120, align: "center" });
  y = 118;

  row(22, [
    { w: W * 0.42, label: "O-Lease Registration Number", bg: LABEL_BG },
    { w: W * 0.58, valueKey: "registrationNumber" },
  ]);

  // ------------------------- A. Personal Data ---------------------------
  sectionHead("A.  Personal Data");
  row(15, [
    { w: C4, label: "Last Name", bg: LABEL_BG }, { w: C4, label: "First Name", bg: LABEL_BG },
    { w: C4, label: "Middle Initial", bg: LABEL_BG }, { w: C4, label: "Suffix", bg: LABEL_BG },
  ]);
  row(20, [
    { w: C4, valueKey: "lastName" }, { w: C4, valueKey: "firstName" },
    { w: C4, valueKey: "middleInitial" }, { w: C4, valueKey: "suffix" },
  ]);
  row(15, [
    { w: C4, label: "Birthday", bg: LABEL_BG }, { w: C4, label: "Sex", bg: LABEL_BG },
    { w: C4, label: "Nationality", bg: LABEL_BG }, { w: C4, label: "Civil Status", bg: LABEL_BG },
  ]);
  row(22, [
    { w: C4, draw: (x, w, h) => (fillable ? valueCell(x, w, h, "birthday") : cellText(x, w, h, fmtDate(d("birthday")))) },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 7, "sex", ["Male", "Female"]) },
    { w: C4, valueKey: "nationality" },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 7, "civilStatus", ["Single", "Married"]) },
  ]);
  row(15, [{ w: W, label: "Home Address", bg: LABEL_BG }]);
  row(38, [{ w: W, valueKey: "homeAddress", multiline: true }]);
  row(15, [
    { w: C4, label: "Telephone Number", bg: LABEL_BG }, { w: C4, label: "Mobile Number", bg: LABEL_BG },
    { w: C4 * 2, label: "Email Address", bg: LABEL_BG },
  ]);
  row(20, [
    { w: C4, valueKey: "telephone" }, { w: C4, valueKey: "mobile" }, { w: C4 * 2, valueKey: "email" },
  ]);
  row(22, [
    { w: C4, label: "Preferred Channel", bg: LABEL_BG },
    { w: C4 * 3, draw: (x, w) => checkRow(x, w, y + 7, "preferredChannel", ["SMS", "Call", "Email", "Viber", "Messenger", "WhatsApp"], {}) },
  ]);
  bar("Details of Spouse");
  row(15, [
    { w: C4, label: "Last Name", bg: LABEL_BG }, { w: C4, label: "First Name", bg: LABEL_BG },
    { w: C4, label: "Middle Initial", bg: LABEL_BG }, { w: C4, label: "Suffix", bg: LABEL_BG },
  ]);
  row(20, [
    { w: C4, valueKey: "spouseLastName" }, { w: C4, valueKey: "spouseFirstName" },
    { w: C4, valueKey: "spouseMiddleInitial" }, { w: C4, valueKey: "spouseSuffix" },
  ]);

  // ------------------------ B. Lease Information ------------------------
  sectionHead("B.  Lease Information");
  row(54, [
    { w: C4, label: "Estate", bg: LABEL_BG },
    { w: C4, draw: (x, w) => checkStack(x, w, y + 8, "estate", ["Capitol Commons", "Circulo Verde", "Greenhills Center", "Ortigas East"]) },
    { w: C4, label: "Name of Building", bg: LABEL_BG },
    { w: C4, valueKey: "buildingName" },
  ]);
  bar("Unit Details");
  row(20, [
    { w: C4, label: "Unit Number", bg: LABEL_BG }, { w: C4, valueKey: "unitNumber" },
    { w: C4, label: "Floor Area (in sqm)", bg: LABEL_BG }, { w: C4, valueKey: "floorArea" },
  ]);
  row(15, [
    { w: C4, label: "Unit Type", bg: LABEL_BG }, { w: C4, label: "Unit Dress-up", bg: LABEL_BG },
    { w: C4, label: "Unit View", bg: LABEL_BG }, { w: C4, label: "Pet Restriction", bg: LABEL_BG },
  ]);
  row(46, [
    { w: C4, draw: (x, w) => checkStack(x, w, y + 7, "unitType", ["Studio", "1-bedroom"], {}) },
    { w: C4, draw: (x, w) => checkStack(x, w, y + 7, "unitDressUp", ["Bare Unit", "Semi-furnished", "Fully Furnished"]) },
    { w: C4, draw: (x, w) => checkStack(x, w, y + 7, "unitView", ["Facing Amenities", "Not Facing Amenities"]) },
    { w: C4, draw: (x, w) => checkStack(x, w, y + 7, "petRestriction", ["With Pet", "No Pet"], { label: "Others" }) },
  ]);
  row(15, [
    { w: C4 * 2, label: "Unit Status", bg: LABEL_BG }, { w: C4 * 2, label: "Preferred Lease Term Period", bg: LABEL_BG },
  ]);
  row(46, [
    { w: C4 * 2, draw: (x, w) => checkStack(x, w, y + 7, "unitStatus", ["EMI", "RTO", "OL EMP"]) },
    { w: C4 * 2, draw: (x, w) => checkStack(x, w, y + 7, "leaseTermPeriod", ["Medium Term (6 to 11 months)", "Long Term (1 year and above)"]) },
  ]);
  row(20, [
    { w: C4, label: "Preferred Lease Rate", bg: LABEL_BG }, { w: C4, valueKey: "preferredLeaseRate" },
    { w: C4, label: "Negotiable", bg: LABEL_BG },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 6, "negotiable", ["Yes", "No"]) },
  ]);
  row(24, [
    { w: C4, label: "Special Instructions", bg: LABEL_BG }, { w: C4 * 3, valueKey: "specialInstructions" },
  ]);
  bar("Parking Details");
  row(15, [
    { w: C4, label: "Parking Slot Number", bg: LABEL_BG }, { w: C4, label: "Floor Area", bg: LABEL_BG },
    { w: C4, label: "For Lease?", bg: LABEL_BG }, { w: C4, label: "Lease Rate", bg: LABEL_BG },
  ]);
  row(22, [
    { w: C4, valueKey: "parkingSlotNumber" }, { w: C4, valueKey: "parkingFloorArea" },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 7, "parkingForLease", ["Yes", "No"]) },
    { w: C4, valueKey: "parkingLeaseRate" },
  ]);
  row(24, [
    { w: C4, label: "Special Instructions", bg: LABEL_BG }, { w: C4 * 3, valueKey: "parkingSpecialInstructions" },
  ]);

  // ------------------- C. Representative Personal Data ------------------
  sectionHead("C.  Representative Personal Data");
  row(15, [
    { w: C4, label: "Last Name", bg: LABEL_BG }, { w: C4, label: "First Name", bg: LABEL_BG },
    { w: C4, label: "Middle Initial", bg: LABEL_BG }, { w: C4, label: "Suffix", bg: LABEL_BG },
  ]);
  row(20, [
    { w: C4, valueKey: "repLastName" }, { w: C4, valueKey: "repFirstName" },
    { w: C4, valueKey: "repMiddleInitial" }, { w: C4, valueKey: "repSuffix" },
  ]);
  row(15, [
    { w: C4, label: "Relationship to Unit Owner", bg: LABEL_BG }, { w: C4 * 3, label: "Home Address", bg: LABEL_BG },
  ]);
  row(34, [
    { w: C4, valueKey: "repRelationship" }, { w: C4 * 3, valueKey: "repHomeAddress", multiline: true },
  ]);
  row(15, [
    { w: C4, label: "Telephone Number", bg: LABEL_BG }, { w: C4, label: "Mobile Number", bg: LABEL_BG },
    { w: C4 * 2, label: "Email Address", bg: LABEL_BG },
  ]);
  row(20, [
    { w: C4, valueKey: "repTelephone" }, { w: C4, valueKey: "repMobile" }, { w: C4 * 2, valueKey: "repEmail" },
  ]);
  row(22, [
    { w: C4, label: "Preferred Channel", bg: LABEL_BG },
    { w: C4 * 3, draw: (x, w) => checkRow(x, w, y + 7, "repPreferredChannel", ["SMS", "Call", "Email", "Viber", "Messenger", "WhatsApp"], {}) },
  ]);

  // -------------------- D. Client Acknowledgement -----------------------
  sectionHead("D.  Client Acknowledgement");
  const consent =
    "I hereby consent (i) to the collection, recording, organization, storage, updating, retrieval, consultation, use, " +
    "consolidation, transfer, sharing, and/or processing of the personal and sensitive personal information indicated above, " +
    "by Ortigas & Company Limited Partnership and its affiliates (collectively, “Ortigas Land”), their agents and authorized " +
    "service providers, in order to review, process, implement or perform acts in relation to this tenant application form and " +
    "such other instruments, papers, or documents submitted in connection therewith, and for the purpose of offering new or " +
    "additional leasable spaces, or other products and services of Ortigas Land and data analytics; and (ii) to the Ortigas Land " +
    "Data Privacy Policy found at https://ortigas.com.ph. I represent and warrant that I have the power and authority to give " +
    "the foregoing consents, and that, if such power and authority is revoked, withdrawn or otherwise modified, Ortigas & " +
    "Company Limited Partnership shall be duly informed in writing.";
  const consentH = doc.font("Helvetica").fontSize(8.5).heightOfString(consent, { width: W - 16, align: "justify" }) + 14;
  ensure(consentH);
  strokeRect(X0, W, consentH);
  doc.font("Helvetica").fontSize(8.5).fillColor(TEXT).text(consent, X0 + 8, y + 7, { width: W - 16, align: "justify" });
  y += consentH;

  y += 10;
  const half = W / 2;
  row(15, [{ w: half, label: "Signed by:", bg: LABEL_BG }, { w: half, label: "Processed by:", bg: LABEL_BG }]);
  row(46, [
    { w: half, draw: (x, w) => { if (fillable) doc.formText("signedByName", x + 4, y + 20, w - 8, 14, { fontSize: 9, borderWidth: 0, backgroundColor: FIELD_BG }); } },
    { w: half, draw: (x, w) => { if (fillable) doc.formText("processedByName", x + 4, y + 20, w - 8, 14, { fontSize: 9, borderWidth: 0, backgroundColor: FIELD_BG }); } },
  ]);
  row(24, [
    { w: half, draw: (x) => { doc.font("Helvetica").fontSize(8).fillColor(TEXT).text("Unit Owner’s Full Name and Signature", x + 5, y + 4); doc.text("Date", x + 5, y + 14); } },
    { w: half, draw: (x) => { doc.font("Helvetica").fontSize(8).fillColor(TEXT).text("Full Name and Signature", x + 5, y + 4); doc.text("Date", x + 5, y + 14); } },
  ]);

  y += 10;
  row(26, [
    { w: C4 * 1.2, label: "How did you know about O-Lease?", bg: LABEL_BG },
    { w: W - C4 * 1.2, draw: (x, w) => checkRow(x, w, y + 9, "howDidYouKnow", ["Website", "Social Media", "Email", "Property Management Office"], {}) },
  ]);

  footer();
}

function makeDoc() {
  // Bottom margin 0 so pdfkit never auto-paginates mid-layout.
  return new PDFDocument({ size: "A4", autoFirstPage: true, margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN } });
}

// Filled PDF from a submitted sheet's data.
export function streamLessorInfoSheetPdf({ data = {} }, res) {
  const doc = makeDoc();
  doc.pipe(res);
  render(doc, { mode: "filled", data });
  doc.end();
  return doc;
}

// Blank interactive AcroForm the lessor fills directly in a PDF viewer.
export function streamLessorInfoSheetFormPdf(res) {
  const doc = makeDoc();
  doc.pipe(res);
  render(doc, { mode: "fillable" });
  doc.end();
  return doc;
}
