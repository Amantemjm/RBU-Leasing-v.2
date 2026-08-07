import { getDashboard } from "../services/dashboardService.js";

export async function get(req, res, next) {
  try {
    res.json(await getDashboard());
  } catch (e) { next(e); }
}
