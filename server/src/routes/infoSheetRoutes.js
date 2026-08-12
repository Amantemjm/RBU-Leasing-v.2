import { Router } from "express";
import * as ctrl from "../controllers/infoSheetController.js";
import { verifyJwt, requireRole, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.post("/", requireWrite, ctrl.create); // O-Lease/Admin requests a sheet for an owner
router.get("/", requireRole("ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER"), ctrl.list);
router.get("/:id", requireRole("ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER"), ctrl.get);
router.patch("/:id/submit", requireRole("UNIT_OWNER"), ctrl.submit); // owner fills + submits own
router.patch("/:id/review", requireWrite, ctrl.review); // approve or return
export default router;
