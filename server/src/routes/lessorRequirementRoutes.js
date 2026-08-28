import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/lessorRequirementController.js";
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

// Owner's own checklist + upload (literal `mine` before the :unitOwnerId param routes).
router.get("/mine", requireRole("UNIT_OWNER"), ctrl.listMine);
router.post("/mine/:key", requireRole("UNIT_OWNER"), upload.single("file"), ctrl.uploadMine);

// Download by row id (scoped in the controller). Before the bare :unitOwnerId GET.
router.get("/:id/download", requireRole("UNIT_OWNER", "ADMIN", "LEASING_OFFICER"), ctrl.download);

// Staff review + on-behalf upload + a lessor's checklist.
router.patch("/:id/review", requireRole("ADMIN", "LEASING_OFFICER"), ctrl.review);
router.post("/:unitOwnerId/:key", requireRole("ADMIN", "LEASING_OFFICER"), upload.single("file"), ctrl.uploadForOwner);
router.get("/:unitOwnerId", requireRole("ADMIN", "LEASING_OFFICER"), ctrl.listForOwner);

export default router;
