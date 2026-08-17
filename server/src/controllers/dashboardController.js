import { getDashboard } from "../services/dashboardService.js";
import { getExecutiveDashboard } from "../services/executiveDashboardService.js";
import { buildExecutiveExcel } from "../lib/executiveExcel.js";

export async function get(req, res, next) {
  try {
    res.json(await getDashboard());
  } catch (e) { next(e); }
}

export async function executive(req, res, next) {
  try {
    res.json(await getExecutiveDashboard(req.user));
  } catch (e) { next(e); }
}

export async function executiveExcel(req, res, next) {
  try {
    const data = await getExecutiveDashboard(req.user);
    const buf = await buildExecutiveExcel(data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="RBU-Leasing-Executive-Report.xlsx"');
    res.send(Buffer.from(buf));
  } catch (e) { next(e); }
}
