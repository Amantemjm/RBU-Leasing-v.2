import { z } from "zod";
import { getExecutiveSummary } from "../services/summaryService.js";

const querySchema = z.object({
  period: z.enum(["month", "quarter", "year"]).optional(),
  date: z.coerce.date().optional(),
});

export async function get(req, res, next) {
  try {
    const { period, date } = querySchema.parse(req.query);
    const summary = await getExecutiveSummary({ type: period || "month", anchor: date || new Date() });
    res.json(summary);
  } catch (e) { next(e); }
}
