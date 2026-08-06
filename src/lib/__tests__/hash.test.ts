import { hashValue, compareValue } from "../hash";

describe("hashValue / compareValue", () => {
  it("gera um hash diferente do valor original", async () => {
    const hash = await hashValue("senha-forte-123");
    expect(hash).not.toBe("senha-forte-123");
    expect(hash).toContain("$2");
  });

  it("compara corretamente o valor correto", async () => {
    const hash = await hashValue("senha-forte-123");
    await expect(compareValue("senha-forte-123", hash)).resolves.toBe(true);
  });

  it("rejeita valor incorreto", async () => {
    const hash = await hashValue("senha-forte-123");
    await expect(compareValue("senha-errada", hash)).resolves.toBe(false);
  });
});
