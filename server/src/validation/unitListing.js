import { z } from "zod";
export const updateListingSchema = z.object({
  details: z.record(z.any()).optional(),
  visibleFields: z.array(z.string()).optional(),
  headline: z.string().optional().nullable(),
});
export const reorderSchema = z.object({ orderedIds: z.array(z.string()).min(1) });
export const captionSchema = z.object({ caption: z.string().optional().nullable() });
export const coverSchema = z.object({ photoId: z.string() });
