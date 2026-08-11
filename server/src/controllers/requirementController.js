import * as service from "../services/requirementService.js";
import { InvalidReferenceError, NotFoundError } from "../lib/errors.js";

export async function create(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    const created = await service.createRequirement({
      tenantId: req.user.tenantId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function list(req, res, next) {
  try {
    const tenantId = req.user.role === "TENANT" ? (req.user.tenantId || "__none__") : req.query.tenantId;
    res.json(await service.listRequirements({ tenantId }));
  } catch (e) { next(e); }
}

export async function download(req, res, next) {
  try {
    const requirement = await service.getRequirement(req.params.id);
    if (req.user.role === "TENANT" && requirement.tenantId !== req.user.tenantId) {
      throw new NotFoundError("Requirement not found");
    }
    res.setHeader("Content-Type", requirement.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${requirement.filename}"`);
    res.send(Buffer.from(requirement.data));
  } catch (e) { next(e); }
}
