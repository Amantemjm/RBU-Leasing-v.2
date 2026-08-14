import { Router } from "express";
import * as ctrl from "../controllers/auditController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const router = Router();
router.get("/", verifyJwt, requireRole("ADMIN"), ctrl.list); // Super Admin only
export default router;
