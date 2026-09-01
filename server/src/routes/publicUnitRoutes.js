import { Router } from "express";
import * as ctrl from "../controllers/publicUnitController.js";
const r = Router();
r.get("/", ctrl.list);
r.get("/photo/:photoId", ctrl.photo);
r.get("/:unitId", ctrl.detail);
export default r;
