import { Router } from "express";
import { login, register, me, users } from "../controllers/authController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const router = Router();
router.post("/login", login);
router.post("/register", verifyJwt, requireRole("ADMIN"), register);
router.get("/users", verifyJwt, requireRole("ADMIN"), users);
router.get("/me", verifyJwt, me);
export default router;
