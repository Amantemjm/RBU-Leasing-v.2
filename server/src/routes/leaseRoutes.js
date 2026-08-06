import { Router } from "express";
import * as ctrl from "../controllers/leaseController.js";
import { verifyJwt, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireWrite, ctrl.create);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
