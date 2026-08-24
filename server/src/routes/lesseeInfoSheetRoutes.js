import { prisma } from "../lib/prisma.js";
import { makeInfoSheetRouter } from "../lib/infoSheet.js";
import { streamLesseeInfoSheetPdf } from "../lib/lesseeInfoSheetPdf.js";
import lesseeConfig from "../config/lesseeInfoSheet.js";
import { lesseeSubmitSchema } from "../validation/lesseeInfoSheet.js";

export default makeInfoSheetRouter({
  model: prisma.lesseeInfoSheet,
  parentModel: prisma.tenant,
  fkField: "tenantId",
  ownerRole: "TENANT",
  relationName: "tenant",
  config: lesseeConfig,
  submitSchema: lesseeSubmitSchema,
  title: "Lessee Acceptance Form",
  filePrefix: "LesseeAcceptanceForm",
  pdfRenderer: streamLesseeInfoSheetPdf,
  binaryField: "filledPdf",
});
