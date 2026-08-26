import { Router } from "express";
import {
  login, register, signup, me, users, editUser, removeUser,
  pendingAccounts, approve, reject,
} from "../controllers/authController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const router = Router();
router.post("/login", login);
// Public self-registration for lessors/lessees.
router.post("/signup", signup);
router.post("/register", verifyJwt, requireRole("ADMIN"), register);
// Account approval queue — the owner asked for ADMIN or O-Lease.
router.get("/pending", verifyJwt, requireRole("ADMIN", "LEASING_OFFICER"), pendingAccounts);
router.patch("/pending/:id/approve", verifyJwt, requireRole("ADMIN", "LEASING_OFFICER"), approve);
router.patch("/pending/:id/reject", verifyJwt, requireRole("ADMIN", "LEASING_OFFICER"), reject);
router.get("/users", verifyJwt, requireRole("ADMIN"), users);
router.patch("/users/:id", verifyJwt, requireRole("ADMIN"), editUser);
router.delete("/users/:id", verifyJwt, requireRole("ADMIN"), removeUser);
router.get("/me", verifyJwt, me);
export default router;
