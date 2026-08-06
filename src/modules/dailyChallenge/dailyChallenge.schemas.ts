import { z } from 'zod';

export const submitDailyChallengeGuessSchema = z.object({
  guessLatitude: z.coerce
    .number()
    .min(-90, 'Latitude inválida.')
    .max(90, 'Latitude inválida.'),
  guessLongitude: z.coerce
    .number()
    .min(-180, 'Longitude inválida.')
    .max(180, 'Longitude inválida.'),
});

export const listDailyChallengeLeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type SubmitDailyChallengeGuessInput = z.infer<
  typeof submitDailyChallengeGuessSchema
>;
export type ListDailyChallengeLeaderboardQuery = z.infer<
  typeof listDailyChallengeLeaderboardQuerySchema
>;
