import lesseeConfig from "../config/lesseeInfoSheet.js";
import { buildSchemaFromConfig } from "../lib/infoSheetSchema.js";

export const lesseeSubmitSchema = buildSchemaFromConfig(lesseeConfig);
