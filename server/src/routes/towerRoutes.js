import { Router } from "express";
import { listTowers } from "../controllers/estateController.js";
import { verifyJwt } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", listTowers);
export default router;
