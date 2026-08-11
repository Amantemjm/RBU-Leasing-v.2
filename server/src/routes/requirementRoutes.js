import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/requirementController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

const router = Router();
router.use(verifyJwt);
router.post("/", requireRole("TENANT"), upload.single("file"), ctrl.create);
router.get("/", requireRole("TENANT", "ADMIN", "LEASING_OFFICER"), ctrl.list);
router.get("/:id/download", requireRole("TENANT", "ADMIN", "LEASING_OFFICER"), ctrl.download);
export default router;
