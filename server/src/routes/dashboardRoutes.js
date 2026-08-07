import { Router } from "express";
import { get } from "../controllers/dashboardController.js";
import { verifyJwt } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", get);
export default router;
