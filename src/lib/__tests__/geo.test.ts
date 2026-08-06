import { haversineDistanceMeters, calculateScore } from "../geo";

describe("haversineDistanceMeters", () => {
  it("retorna 0 para o mesmo ponto", () => {
    expect(haversineDistanceMeters(-23.4109, -51.9388, -23.4109, -51.9388)).toBe(0);
  });

  it("calcula ~111km por grau de latitude", () => {
    const distance = haversineDistanceMeters(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it("é simétrico (ordem dos argumentos não importa)", () => {
    const a = haversineDistanceMeters(10, 20, -30, 40);
    const b = haversineDistanceMeters(-30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe("calculateScore", () => {
  it("retorna pontuação máxima (1000) para distância zero", () => {
    expect(calculateScore(0)).toBe(1000);
  });

  it("decai exponencialmente com a distância", () => {
    const at300m = calculateScore(300);
    expect(at300m).toBe(368);
  });

  it("retorna ~0 para distâncias muito grandes", () => {
    expect(calculateScore(100_000)).toBe(0);
  });

  it("nunca retorna valor negativo", () => {
    expect(calculateScore(50_000)).toBeGreaterThanOrEqual(0);
  });
});
