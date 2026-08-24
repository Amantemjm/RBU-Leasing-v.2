import { Router } from "express";
import * as ctrl from "../controllers/pageFormController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

// Admin configuration of page-form slots. Mounted at /api/cms/page-forms.
// Super Admin only.
export const cmsPageFormRouter = Router();
cmsPageFormRouter.use(verifyJwt, requireRole("ADMIN"));
cmsPageFormRouter.get("/", ctrl.list);
cmsPageFormRouter.get("/:role/:pageKey", ctrl.get);
cmsPageFormRouter.put("/:role/:pageKey", ctrl.save);
cmsPageFormRouter.delete("/:role/:pageKey", ctrl.remove);
cmsPageFormRouter.get("/:role/:pageKey/entries", ctrl.entries);

// Runtime: the signed-in user reads/saves the form on their own page.
// Mounted at /api/page-forms. Any authenticated user.
export const pageFormRouter = Router();
pageFormRouter.use(verifyJwt);
pageFormRouter.get("/mine/:pageKey", ctrl.getMine);
pageFormRouter.put("/mine/:pageKey", ctrl.saveMine);
