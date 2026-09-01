import { prisma } from "../lib/prisma.js";
import { makeInfoSheetRouter } from "../lib/infoSheet.js";
import { streamLessorInfoSheetPdf } from "../lib/lessorInfoSheetPdf.js";
import lessorConfig from "../config/lessorInfoSheet.js";
import { lessorSubmitSchema } from "../validation/lessorInfoSheet.js";
import { listForOwner } from "../services/lessorRequirementService.js";
import { ConflictError } from "../lib/errors.js";

async function lessorAcceptanceGuard(unitOwnerId) {
  const approvedUnits = await prisma.unit.count({ where: { ownerId: unitOwnerId, approvalStatus: "APPROVED" } });
  if (approvedUnits === 0) throw new ConflictError("The lessor needs at least one approved unit before the acceptance form can be approved");
  const reqs = await listForOwner(unitOwnerId);
  const approved = reqs.filter((r) => r.status === "Approved").length;
  if (approved < reqs.length) throw new ConflictError(`All requirements must be approved first (${approved}/${reqs.length})`);
}

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
  approveGuard: lessorAcceptanceGuard,
});
