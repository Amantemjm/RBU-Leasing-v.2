import { Router } from "express";
import { login, register, me, users, editUser, removeUser } from "../controllers/authController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const router = Router();
router.post("/login", login);
router.post("/register", verifyJwt, requireRole("ADMIN"), register);
router.get("/users", verifyJwt, requireRole("ADMIN"), users);
router.patch("/users/:id", verifyJwt, requireRole("ADMIN"), editUser);
router.delete("/users/:id", verifyJwt, requireRole("ADMIN"), removeUser);
router.get("/me", verifyJwt, me);
export default router;
