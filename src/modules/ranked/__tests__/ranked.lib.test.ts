import {
  BASE_RATING,
  ELO_DIVISOR,
  ELO_K,
  divisionForRating,
  divisionLabel,
  expectedScore,
  ratingDelta,
  roundDamage,
  roundMultiplier,
  MULTIPLIER_INCREMENT,
} from '../ranked.lib';

describe('divisionForRating', () => {
  it('retorna as divisões de acordo com a pontuação', () => {
    expect(divisionForRating(0)).toBe('BRONZE_III');
    expect(divisionForRating(399)).toBe('BRONZE_III');
    expect(divisionForRating(400)).toBe('BRONZE_II');
    expect(divisionForRating(800)).toBe('BRONZE_I');
    expect(divisionForRating(1199)).toBe('BRONZE_I');
    expect(divisionForRating(BASE_RATING)).toBe('PRATA_III');
    expect(divisionForRating(2400)).toBe('OURO_III');
    expect(divisionForRating(4800)).toBe('DIAMANTE_III');
    expect(divisionForRating(6000)).toBe('MESTRE');
    expect(divisionForRating(10000)).toBe('MESTRE');
  });

  it('nunca retorna divisão abaixo de Bronze III para rating negativo', () => {
    expect(divisionForRating(-50)).toBe('BRONZE_III');
  });
});

describe('divisionLabel', () => {
  it('retorna o rótulo em português', () => {
    expect(divisionLabel('BRONZE_III')).toBe('Bronze III');
    expect(divisionLabel('DIAMANTE_I')).toBe('Diamante I');
    expect(divisionLabel('MESTRE')).toBe('Mestre');
  });

  it('retorna o próprio valor para divisões desconhecidas', () => {
    expect(divisionLabel('DESCONHECIDA')).toBe('DESCONHECIDA');
  });
});

describe('roundMultiplier', () => {
  it('cresce a cada rodada', () => {
    expect(roundMultiplier(1)).toBe(1);
    expect(roundMultiplier(2)).toBe(1 + MULTIPLIER_INCREMENT);
    expect(roundMultiplier(3)).toBe(1 + MULTIPLIER_INCREMENT * 2);
  });
});

describe('roundDamage', () => {
  it('calcula o dano a partir da diferença de pontos e multiplicador', () => {
    expect(roundDamage(300, 1)).toBe(300);
    expect(roundDamage(300, 1.5)).toBe(450);
    expect(roundDamage(300, 2)).toBe(600);
    expect(roundDamage(0, 3)).toBe(0);
    expect(roundDamage(-10, 1)).toBe(0);
  });
});

describe('expectedScore', () => {
  it('retorna 0.5 para oponentes com o mesmo rating', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('favorece o jogador com maior rating', () => {
    expect(expectedScore(1200, 800)).toBeGreaterThan(0.5);
    expect(expectedScore(800, 1200)).toBeLessThan(0.5);
  });
});

describe('ratingDelta', () => {
  it('distribui o K igualmente quando os ratings são iguais', () => {
    expect(ratingDelta(1200, 1200, 1)).toBe(Math.round(ELO_K * 0.5));
    expect(ratingDelta(1200, 1200, 0)).toBe(-Math.round(ELO_K * 0.5));
  });

  it('ganhar de um oponente mais forte rende mais pontos', () => {
    const winVsStronger = ratingDelta(1200, 1600, 1);
    const winVsEqual = ratingDelta(1200, 1200, 1);
    expect(winVsStronger).toBeGreaterThan(winVsEqual);
  });

  it('perder para um oponente mais forte custa menos pontos', () => {
    const lossVsStronger = ratingDelta(1200, 1600, 0);
    const lossVsEqual = ratingDelta(1200, 1200, 0);
    expect(lossVsStronger).toBeGreaterThan(lossVsEqual);
  });

  it('usa o divisor padrão de 400 no cálculo', () => {
    const p = Math.pow(10, (1600 - 1200) / ELO_DIVISOR);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / (1 + p));
  });
});
