import { Router } from "express";
import { get, executive, executiveExcel } from "../controllers/dashboardController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", get);
// Executive Dashboard — Super Admin and O-Lease only.
const execRoles = requireRole("ADMIN", "LEASING_OFFICER");
router.get("/executive", execRoles, executive);
router.get("/executive.xlsx", execRoles, executiveExcel);
export default router;
