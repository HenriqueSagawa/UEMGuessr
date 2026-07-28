import { z } from "zod";
 
export const submitGuessSchema = z.object({
  locationId: z.string().min(1, "locationId é obrigatório."),
  guessLatitude: z.coerce.number().min(-90, "Latitude inválida.").max(90, "Latitude inválida."),
  guessLongitude: z.coerce
    .number()
    .min(-180, "Longitude inválida.")
    .max(180, "Longitude inválida."),
});

export const listGamesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SubmitGuessInput = z.infer<typeof submitGuessSchema>;
export type ListGamesQuery = z.infer<typeof listGamesQuerySchema>;