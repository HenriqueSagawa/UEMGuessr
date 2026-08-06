export type DivisionKey =
  | 'BRONZE_III'
  | 'BRONZE_II'
  | 'BRONZE_I'
  | 'PRATA_III'
  | 'PRATA_II'
  | 'PRATA_I'
  | 'OURO_III'
  | 'OURO_II'
  | 'OURO_I'
  | 'PLATINA_III'
  | 'PLATINA_II'
  | 'PLATINA_I'
  | 'DIAMANTE_III'
  | 'DIAMANTE_II'
  | 'DIAMANTE_I'
  | 'MESTRE';

export const DIVISION_THRESHOLDS: ReadonlyArray<{
  division: DivisionKey;
  min: number;
  label: string;
}> = [
  { division: 'BRONZE_III', min: 0, label: 'Bronze III' },
  { division: 'BRONZE_II', min: 400, label: 'Bronze II' },
  { division: 'BRONZE_I', min: 800, label: 'Bronze I' },
  { division: 'PRATA_III', min: 1200, label: 'Prata III' },
  { division: 'PRATA_II', min: 1600, label: 'Prata II' },
  { division: 'PRATA_I', min: 2000, label: 'Prata I' },
  { division: 'OURO_III', min: 2400, label: 'Ouro III' },
  { division: 'OURO_II', min: 2800, label: 'Ouro II' },
  { division: 'OURO_I', min: 3200, label: 'Ouro I' },
  { division: 'PLATINA_III', min: 3600, label: 'Platina III' },
  { division: 'PLATINA_II', min: 4000, label: 'Platina II' },
  { division: 'PLATINA_I', min: 4400, label: 'Platina I' },
  { division: 'DIAMANTE_III', min: 4800, label: 'Diamante III' },
  { division: 'DIAMANTE_II', min: 5200, label: 'Diamante II' },
  { division: 'DIAMANTE_I', min: 5600, label: 'Diamante I' },
  { division: 'MESTRE', min: 6000, label: 'Mestre' },
];

export function divisionForRating(rating: number): DivisionKey {
  let current = DIVISION_THRESHOLDS[0]!.division;
  for (const tier of DIVISION_THRESHOLDS) {
    if (rating >= tier.min) current = tier.division;
  }
  return current;
}

export function divisionLabel(division: string): string {
  return (
    DIVISION_THRESHOLDS.find((tier) => tier.division === division)?.label ??
    division
  );
}

export const INITIAL_HEALTH = 5000;
export const BASE_RATING = 1200;
export const ELO_K = 40;
export const ELO_DIVISOR = 400;
export const ROUND_TIME_LIMIT_SECONDS = 60;
export const EARLY_ANSWER_WINDOW_SECONDS = 15;
export const MULTIPLIER_START = 1;
export const MULTIPLIER_INCREMENT = 0.5;
export const QUEUE_TTL_MS = 5 * 60 * 1000;

export function roundMultiplier(roundNumber: number): number {
  return MULTIPLIER_START + (roundNumber - 1) * MULTIPLIER_INCREMENT;
}

export function roundDamage(
  scoreDifference: number,
  multiplier: number,
): number {
  return Math.floor(Math.max(0, scoreDifference) * multiplier);
}

export function expectedScore(
  ownRating: number,
  opponentRating: number,
): number {
  return 1 / (1 + Math.pow(10, (opponentRating - ownRating) / ELO_DIVISOR));
}

export function ratingDelta(
  ownRating: number,
  opponentRating: number,
  result: 0 | 1,
): number {
  return Math.round(
    ELO_K * (result - expectedScore(ownRating, opponentRating)),
  );
}
