import { generateSixDigitCode } from "../generateCode";

describe("generateSixDigitCode", () => {
  it("retorna um código de 6 dígitos", () => {
    const code = generateSixDigitCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("faz padding com zeros à esquerda", () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateSixDigitCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});
