import { Router } from "express";
import { verifyJwt, requireWrite } from "../middleware/auth.js";
import * as ctrl from "../controllers/appointmentController.js";

const r = Router();
r.use(verifyJwt);
r.get("/mine", ctrl.mine);
r.get("/transaction/:txnId", ctrl.forTransaction);
r.post("/transaction/:txnId/:stage", requireWrite, ctrl.schedule);
export default r;
