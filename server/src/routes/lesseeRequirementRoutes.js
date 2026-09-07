import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/lesseeRequirementController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const ALLOWED = new Set([
  "application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

const router = Router();
router.use(verifyJwt);

// The lessee's own checklist + upload. Literal `mine` before the :tenantId routes.
router.get("/mine", requireRole("TENANT"), ctrl.listMine);
router.post("/mine/:key", requireRole("TENANT"), upload.single("file"), ctrl.uploadMine);

// Download by row id, scoped in the controller. Before the bare :tenantId GET.
router.get("/:id/download", requireRole("TENANT", "ADMIN", "LEASING_OFFICER"), ctrl.download);

// Staff review, on-behalf upload, and a named tenant's checklist.
router.patch("/:id/review", requireRole("ADMIN", "LEASING_OFFICER"), ctrl.review);
router.post("/:tenantId/:key", requireRole("ADMIN", "LEASING_OFFICER"), upload.single("file"), ctrl.uploadForTenant);
router.get("/:tenantId", requireRole("ADMIN", "LEASING_OFFICER"), ctrl.listForTenant);

export default router;
