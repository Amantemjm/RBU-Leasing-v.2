import lessorConfig from "../config/lessorInfoSheet.js";
import { buildSchemaFromConfig } from "../lib/infoSheetSchema.js";

export const lessorSubmitSchema = buildSchemaFromConfig(lessorConfig);
