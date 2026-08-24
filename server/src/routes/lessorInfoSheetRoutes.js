import { prisma } from "../lib/prisma.js";
import { makeInfoSheetRouter } from "../lib/infoSheet.js";
import { streamLessorInfoSheetPdf } from "../lib/lessorInfoSheetPdf.js";
import lessorConfig from "../config/lessorInfoSheet.js";
import { lessorSubmitSchema } from "../validation/lessorInfoSheet.js";

export default makeInfoSheetRouter({
  model: prisma.lessorInfoSheet,
  parentModel: prisma.unitOwner,
  fkField: "unitOwnerId",
  ownerRole: "UNIT_OWNER",
  relationName: "unitOwner",
  config: lessorConfig,
  submitSchema: lessorSubmitSchema,
  title: "Unit Owner Acceptance Form",
  filePrefix: "UnitOwnerAcceptanceForm",
  pdfRenderer: streamLessorInfoSheetPdf,
  binaryField: "filledPdf",
});
