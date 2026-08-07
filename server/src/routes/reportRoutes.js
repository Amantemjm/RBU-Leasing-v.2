import { Router } from "express";
import { verifyJwt } from "../middleware/auth.js";
import { rentRoll, collections, leaseExpiry, ownerStatement } from "../controllers/reportController.js";

const router = Router();
router.use(verifyJwt);
router.get("/rent-roll", rentRoll);
router.get("/collections", collections);
router.get("/lease-expiry", leaseExpiry);
router.get("/owner-statement", ownerStatement);
export default router;
