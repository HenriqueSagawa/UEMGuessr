import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../jwt";

describe("jwt access token", () => {
  it("faz round-trip de sign/verify com o payload correto", () => {
    const token = signAccessToken({ sub: "user-123", role: "USER" });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe("user-123");
    expect(payload.role).toBe("USER");
    expect(payload.tokenType).toBe("access");
  });

  it("rejeita um token de refresh verificado como access", () => {
    const refresh = signRefreshToken({ sub: "user-123", jti: "jti-1" });
    expect(() => verifyAccessToken(refresh)).toThrow();
  });
});

describe("jwt refresh token", () => {
  it("faz round-trip de sign/verify com o payload correto", () => {
    const token = signRefreshToken({ sub: "user-123", jti: "jti-1" });
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe("user-123");
    expect(payload.jti).toBe("jti-1");
    expect(payload.tokenType).toBe("refresh");
  });

  it("rejeita um token de access verificado como refresh", () => {
    const access = signAccessToken({ sub: "user-123", role: "USER" });
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it("rejeita token inválido", () => {
    expect(() => verifyAccessToken("token-invalido")).toThrow();
  });
});
