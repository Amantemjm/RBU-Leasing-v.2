// Read-only reference data for the signed-out signup page. Deliberately narrow:
// id and name only, so this endpoint can never become a portfolio dump. The
// authenticated /api/estates and /api/towers are unchanged and still carry the
// full records for staff.
import { listEstates, listTowers } from "../services/estateService.js";

const nameOnly = (rows) => rows.map(({ id, name }) => ({ id, name }));

export async function estates(req, res, next) {
  try { res.json(nameOnly(await listEstates())); } catch (e) { next(e); }
}

export async function towers(req, res, next) {
  try {
    const { estateId } = req.query;
    // Scope is required: without it this lists every tower in the portfolio.
    if (!estateId) return res.status(400).json({ error: "estateId is required" });
    res.json(nameOnly(await listTowers({ estateId })));
  } catch (e) { next(e); }
}
