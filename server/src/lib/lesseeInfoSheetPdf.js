import PDFDocument from "pdfkit";

// Renders the official O-Lease "Lessee Information Sheet • Registration" form as
// a pixel-faithful 2-page PDF from a submitted sheet's data (filled mode) —
// used for the live form preview and the staff download.

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 40;
const MARGIN_B = 34;
const X0 = MARGIN;
const X1 = PAGE.w - MARGIN;
const W = X1 - X0;
const C4 = W / 4;
const TOP = 44;

const BORDER = "#B7B7B7";
const LABEL_BG = "#F2F2F2";
const BAR_BG = "#D9D9D9";
const TEXT = "#1A1A1A";
const MUTED = "#666666";
const TEAL = "#2E6B5E";

function fmtDate(v) {
  if (!v) return "";
  const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(v);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

function render(doc, { data = {} }) {
  const d = (k) => { const v = data[k]; return v === undefined || v === null ? "" : v; };
  const has = (k, opt) => { const v = data[k]; return Array.isArray(v) ? v.includes(opt) : v === opt; };

  let y = TOP;
  let pageNo = 1;

  const fillRect = (x, w, h, color) => { doc.save().rect(x, y, w, h).fillColor(color).fill().restore(); };
  const strokeRect = (x, w, h) => { doc.save().rect(x, y, w, h).lineWidth(0.7).strokeColor(BORDER).stroke().restore(); };

  function footer() {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(String(pageNo), X0, PAGE.h - 26, { width: W, align: "right" });
  }
  function newPage() { footer(); doc.addPage(); pageNo++; y = TOP; }
  function ensure(h) { if (y + h > PAGE.h - MARGIN_B) newPage(); }

  function cellText(x, w, h, text, opts = {}) {
    const { bold = false, size = 9, color = TEXT, align = "left" } = opts;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
    const ty = y + Math.max(3, (h - size) / 2 - 1);
    doc.text(text == null ? "" : String(text), x + 5, ty, { width: w - 10, height: h - 4, align, lineBreak: false, ellipsis: true });
  }
  function valueCell(x, w, h, key) { cellText(x, w, h, d(key)); }

  const BOX = 9;
  function square(x, cy) { doc.save().rect(x, cy, BOX, BOX).lineWidth(0.8).strokeColor("#555").stroke().restore(); }
  function drawCheck(x, cy) {
    doc.save().moveTo(x + 1.6, cy + 4.4).lineTo(x + 3.5, cy + 7).lineTo(x + 7.5, cy + 1.6).lineWidth(1.2).strokeColor(TEAL).stroke().restore();
  }
  function tickBox(x, cy, key, opt) { square(x, cy); if (has(key, opt)) drawCheck(x, cy); }

  const LBL = 6 + BOX + 4;
  function checkStack(x, w, cy, key, options, other) {
    let yy = cy;
    doc.font("Helvetica").fontSize(8.5);
    for (const opt of options) {
      tickBox(x + 6, yy, key, opt);
      doc.fillColor(has(key, opt) ? TEAL : TEXT).text(opt, x + LBL, yy, { width: w - LBL - 4, lineBreak: false, ellipsis: true });
      yy += 13;
    }
    if (other) {
      square(x + 6, yy); if (d(`${key}Other`)) drawCheck(x + 6, yy);
      const lbl = other.label ? `${other.label}:` : "";
      let lx = x + LBL;
      if (lbl) { doc.fillColor(TEXT).text(lbl, lx, yy, { lineBreak: false }); lx += doc.widthOfString(lbl) + 4; }
      doc.fillColor(TEXT).text(d(`${key}Other`) || "____________", lx, yy, { lineBreak: false });
    }
  }
  function checkRow(x, w, cy, key, options, other) {
    let cx = x + 6;
    doc.font("Helvetica").fontSize(8.5);
    for (const opt of options) {
      const need = (BOX + 4) + doc.widthOfString(opt) + 10;
      if (cx + need > x + w) { cx = x + 6; cy += 13; }
      tickBox(cx, cy, key, opt);
      doc.fillColor(has(key, opt) ? TEAL : TEXT).text(opt, cx + BOX + 4, cy, { lineBreak: false });
      cx += need;
    }
    if (other) {
      square(cx, cy); if (d(`${key}Other`)) drawCheck(cx, cy);
      const lx = cx + BOX + 4;
      doc.fillColor(TEXT).text(d(`${key}Other`) || "________", lx, cy, { lineBreak: false });
    }
  }

  function row(h, cells) {
    ensure(h);
    let x = X0;
    for (const c of cells) {
      const w = c.w;
      if (c.bg) fillRect(x, w, h, c.bg);
      strokeRect(x, w, h);
      if (c.draw) c.draw(x, w, h);
      else if (c.label != null) cellText(x, w, h, c.label, { bold: true, size: 8.5 });
      else if (c.valueKey != null) valueCell(x, w, h, c.valueKey);
      x += w;
    }
    y += h;
  }
  const bar = (label) => row(15, [{ w: W, label, bg: BAR_BG }]);
  function sectionHead(label) { ensure(26); y += 8; doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT).text(label, X0, y); y += 16; }

  // ======================= HEADER (page 1) ==============================
  doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT).text("Lessee Information Sheet • Registration", X0, 52, { width: 400 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(TEAL).text("O–L", X1 - 90, 46, { width: 90, align: "center" });
  doc.font("Helvetica").fontSize(20).fillColor(TEAL).text("O-Lease", X1 - 120, 74, { width: 120, align: "center" });
  y = 118;

  row(22, [{ w: W * 0.42, label: "O-Lease Registration Number", bg: LABEL_BG }, { w: W * 0.58, valueKey: "registrationNumber" }]);

  // ------------------------- A. Personal Data ---------------------------
  sectionHead("A.  Personal Data");
  row(15, [
    { w: C4, label: "Last Name", bg: LABEL_BG }, { w: C4, label: "First Name", bg: LABEL_BG },
    { w: C4, label: "Middle Initial", bg: LABEL_BG }, { w: C4, label: "Suffix", bg: LABEL_BG },
  ]);
  row(20, [
    { w: C4, valueKey: "lastName" }, { w: C4, valueKey: "firstName" }, { w: C4, valueKey: "middleInitial" }, { w: C4, valueKey: "suffix" },
  ]);
  row(15, [
    { w: C4, label: "Birthday", bg: LABEL_BG }, { w: C4, label: "Sex", bg: LABEL_BG },
    { w: C4, label: "Nationality", bg: LABEL_BG }, { w: C4, label: "Civil Status", bg: LABEL_BG },
  ]);
  row(22, [
    { w: C4, draw: (x, w, h) => cellText(x, w, h, fmtDate(d("birthday"))) },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 7, "sex", ["Male", "Female"]) },
    { w: C4, valueKey: "nationality" },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 7, "civilStatus", ["Single", "Married"]) },
  ]);
  row(15, [{ w: W, label: "Home Address", bg: LABEL_BG }]);
  row(34, [{ w: W, valueKey: "homeAddress" }]);
  row(15, [
    { w: C4, label: "Telephone Number", bg: LABEL_BG }, { w: C4, label: "Mobile Number", bg: LABEL_BG },
    { w: C4 * 2, label: "Email Address", bg: LABEL_BG },
  ]);
  row(20, [{ w: C4, valueKey: "telephone" }, { w: C4, valueKey: "mobile" }, { w: C4 * 2, valueKey: "email" }]);
  row(15, [{ w: C4 * 2 }, { w: C4 * 2, label: "TIN", bg: LABEL_BG }]);
  row(18, [{ w: C4 * 2 }, { w: C4 * 2, valueKey: "tin" }]);
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
  row(15, [{ w: C4 * 2, label: "Unit Payment Status", bg: LABEL_BG }, { w: C4 * 2, label: "Lease Term Period", bg: LABEL_BG }]);
  row(38, [
    { w: C4 * 2, draw: (x, w) => checkStack(x, w, y + 7, "unitPaymentStatus", ["Full Payment thru Cash", "Post-dated Checks"]) },
    { w: C4 * 2, draw: (x, w) => checkStack(x, w, y + 7, "leaseTermPeriod", ["Medium Term (6 to 11 months)", "Long Term (1 year and above)"]) },
  ]);
  row(20, [
    { w: C4, label: "Preferred Lease Rate", bg: LABEL_BG }, { w: C4, valueKey: "preferredLeaseRate" },
    { w: C4, label: "Negotiable", bg: LABEL_BG },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 6, "negotiable", ["Yes", "No"]) },
  ]);
  row(24, [{ w: C4, label: "Special Instructions", bg: LABEL_BG }, { w: C4 * 3, valueKey: "specialInstructions" }]);
  bar("Parking Details");
  row(20, [
    { w: C4, label: "Need Parking?", bg: LABEL_BG },
    { w: C4, draw: (x, w) => checkRow(x, w, y + 6, "needParking", ["Yes", "No"]) },
    { w: C4, label: "Quantity of Slots", bg: LABEL_BG }, { w: C4, valueKey: "parkingSlots" },
  ]);
  row(24, [{ w: C4, label: "Special Instructions", bg: LABEL_BG }, { w: C4 * 3, valueKey: "parkingSpecialInstructions" }]);

  // ------------------------- C. Employment Data -------------------------
  sectionHead("C.  Employment Data");
  row(44, [
    { w: C4, label: "Type of Employment", bg: LABEL_BG },
    { w: C4, draw: (x, w) => checkStack(x, w, y + 8, "typeOfEmployment", ["Employed", "Business Owner", "Practicing Profession"]) },
    { w: C4, label: "Position", bg: LABEL_BG }, { w: C4, valueKey: "position" },
  ]);
  row(20, [{ w: C4, label: "Name of Company", bg: LABEL_BG }, { w: C4 * 3, valueKey: "companyName" }]);
  row(20, [{ w: C4, label: "Nature of Business", bg: LABEL_BG }, { w: C4 * 3, valueKey: "natureOfBusiness" }]);
  row(15, [{ w: W, label: "Company Address", bg: LABEL_BG }]);
  row(34, [{ w: W, valueKey: "companyAddress" }]);
  row(15, [
    { w: C4, label: "Company Phone", bg: LABEL_BG }, { w: C4, label: "Company Mobile Number", bg: LABEL_BG },
    { w: C4 * 2, label: "Company Email Address", bg: LABEL_BG },
  ]);
  row(20, [{ w: C4, valueKey: "companyPhone" }, { w: C4, valueKey: "companyMobile" }, { w: C4 * 2, valueKey: "companyEmail" }]);

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
  row(46, [{ w: half }, { w: half }]);
  row(24, [
    { w: half, draw: (x) => { doc.font("Helvetica").fontSize(8).fillColor(TEXT).text("Lessee’s Full Name and Signature", x + 5, y + 4); doc.text("Date", x + 5, y + 14); } },
    { w: half, draw: (x) => { doc.font("Helvetica").fontSize(8).fillColor(TEXT).text("Full Name and Signature", x + 5, y + 4); doc.text("Date", x + 5, y + 14); } },
  ]);

  y += 10;
  row(26, [
    { w: C4 * 1.2, label: "How did you know about O-Lease?", bg: LABEL_BG },
    { w: W - C4 * 1.2, draw: (x, w) => checkRow(x, w, y + 9, "howDidYouKnow", ["Website", "Social Media", "Email", "Property Management Office"], {}) },
  ]);

  footer();
}

// Filled PDF from a submitted lessee sheet's data. Signature mirrors the lessor
// renderer: `({ data }, res)`.
export function streamLesseeInfoSheetPdf({ data = {} }, res) {
  const doc = new PDFDocument({ size: "A4", autoFirstPage: true, margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN } });
  doc.pipe(res);
  render(doc, { data });
  doc.end();
  return doc;
}
