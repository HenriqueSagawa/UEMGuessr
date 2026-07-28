import { z } from "zod";

export const createLocationSchema = z.object({
  name: z.string().trim().min(3, "O nome precisa ter no mínimo 3 caracteres.").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  latitude: z.coerce
    .number()
    .min(-90, "Latitude inválida.")
    .max(90, "Latitude inválida."),
  longitude: z.coerce
    .number()
    .min(-180, "Longitude inválida.")
    .max(180, "Longitude inválida."),
});
 
export const updateLocationSchema = createLocationSchema.partial();
 
export const listLocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;