import { Router } from "express";
import { listEstates } from "../controllers/estateController.js";
import { verifyJwt } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", listEstates);
export default router;
