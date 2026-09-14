import { Router } from "express";
import * as ctrl from "../controllers/publicReferenceController.js";

export const publicEstateRouter = Router();
publicEstateRouter.get("/", ctrl.estates);

export const publicTowerRouter = Router();
publicTowerRouter.get("/", ctrl.towers);
