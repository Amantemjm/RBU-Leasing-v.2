import { Router } from "express";
import { verifyJwt, requireRole, requireWrite } from "../middleware/auth.js";
import * as ctrl from "../controllers/unitListingController.js";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const r = Router();
r.use(verifyJwt);
r.get("/:unitId", requireRole(...STAFF), ctrl.get);
r.patch("/:unitId", requireWrite, ctrl.update);
export default r;
