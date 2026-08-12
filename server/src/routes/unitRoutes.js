import { Router } from "express";
import * as ctrl from "../controllers/unitController.js";
import { verifyJwt, requireWrite, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
// Staff see all (filtered); a UNIT_OWNER is auto-scoped to their own units. Tenants are blocked.
router.get("/", requireRole("ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER"), ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireRole("ADMIN", "LEASING_OFFICER", "UNIT_OWNER"), ctrl.create);
router.patch("/:id/approve", requireWrite, ctrl.approve);
router.patch("/:id/reject", requireWrite, ctrl.reject);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
