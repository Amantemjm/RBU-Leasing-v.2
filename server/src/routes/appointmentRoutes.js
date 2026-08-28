import { Router } from "express";
import { verifyJwt, requireWrite } from "../middleware/auth.js";
import * as ctrl from "../controllers/appointmentController.js";

const r = Router();
r.use(verifyJwt);
r.get("/mine", ctrl.mine);
r.get("/transaction/:txnId", ctrl.forTransaction);
r.post("/transaction/:txnId/:stage", requireWrite, ctrl.schedule);
r.patch("/:id/reschedule", requireWrite, ctrl.reschedule);
r.patch("/:id/complete", requireWrite, ctrl.complete);
r.patch("/:id/cancel", requireWrite, ctrl.cancel);
export default r;
