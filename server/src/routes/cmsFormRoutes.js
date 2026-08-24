import { Router } from "express";
import * as ctrl from "../controllers/cmsFormController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

// The CMS form builder is a Super Admin back-office tool: every route is
// ADMIN-only.
const router = Router();
router.use(verifyJwt, requireRole("ADMIN"));
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
export default router;
