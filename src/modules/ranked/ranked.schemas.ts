import { z } from 'zod';

export const submitAnswerSchema = z.object({
  guessLatitude: z.coerce
    .number()
    .min(-90, 'Latitude inválida.')
    .max(90, 'Latitude inválida.'),
  guessLongitude: z.coerce
    .number()
    .min(-180, 'Longitude inválida.')
    .max(180, 'Longitude inválida.'),
});

export const createSeasonSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'O nome da temporada é obrigatório.')
    .max(80)
    .optional(),
});

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const roundNumberParamSchema = z.coerce.number().int().min(1);

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
