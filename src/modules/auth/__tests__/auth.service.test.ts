import { AppError } from "../../../utils/appError";
import * as authService from "../auth.service";
import { prisma } from "../../../config/prisma";

jest.mock("../../../config/prisma", () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationCode: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../../lib/hash", () => ({
  hashValue: jest.fn(async (value: string) => `hashed:${value}`),
  compareValue: jest.fn(),
}));

jest.mock("../../../lib/jwt", () => ({
  signAccessToken: jest.fn(() => "access-token"),
  signRefreshToken: jest.fn(() => "refresh-token"),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

jest.mock("../../../lib/GoogleOAuth", () => ({
  getGoogleUser: jest.fn(),
}));

jest.mock("../../../services/email.service", () => ({
  sendVerificationCodeEmail: jest.fn(),
}));

import { hashValue, compareValue } from "../../../lib/hash";
import { verifyRefreshToken } from "../../../lib/jwt";
import { getGoogleUser } from "../../../lib/GoogleOAuth";
import { sendVerificationCodeEmail } from "../../../services/email.service";

const mockFindFirst = prisma.user.findFirst as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserCreate = prisma.user.create as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockEmailCodeCreate = prisma.emailVerificationCode.create as jest.Mock;
const mockEmailCodeFindFirst = prisma.emailVerificationCode.findFirst as jest.Mock;
const mockRefreshCreate = prisma.refreshToken.create as jest.Mock;
const mockRefreshFindUnique = prisma.refreshToken.findUnique as jest.Mock;
const mockRefreshUpdate = prisma.refreshToken.update as jest.Mock;
const mockRefreshUpdateMany = prisma.refreshToken.updateMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const mockVerifyRefresh = verifyRefreshToken as jest.Mock;
const mockCompare = compareValue as jest.Mock;
const mockGetGoogleUser = getGoogleUser as jest.Mock;
const mockSendEmail = sendVerificationCodeEmail as jest.Mock;

const userRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  username: "henrique",
  email: "henrique@uem.com",
  password: "hashed:SenhaForte1",
  role: "USER",
  avatarUrl: null,
  emailVerified: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockReset();
  mockFindFirst.mockReset();
  mockUserCreate.mockReset();
  mockUserUpdate.mockReset();
  mockEmailCodeCreate.mockReset();
  mockEmailCodeFindFirst.mockReset();
  mockRefreshCreate.mockReset();
  mockRefreshFindUnique.mockReset();
  mockRefreshUpdate.mockReset();
  mockRefreshUpdateMany.mockReset();
  mockTransaction.mockReset();
  mockCompare.mockReset();
  mockVerifyRefresh.mockReset();
  mockGetGoogleUser.mockReset();
});

describe("register", () => {
  const input = { username: "henrique", email: "henrique@uem.com", password: "SenhaForte1" };

  it("lança 409 se o email já está em uso", async () => {
    mockFindFirst.mockResolvedValue(userRecord());

    await expect(authService.register(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Este email já está em uso.",
    });
  });

  it("lança 409 se o nome de usuário já está em uso", async () => {
    mockFindFirst.mockResolvedValue(userRecord({ email: "outro@uem.com" }));

    await expect(authService.register(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Este nome de usuário já está em uso.",
    });
  });

  it("cria o usuário com senha criptografada e envia código de verificação", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue(userRecord());
    mockEmailCodeCreate.mockResolvedValue({ id: "code-1" });

    const result = await authService.register(input);

    expect(hashValue).toHaveBeenCalledWith(input.password);
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        username: input.username,
        email: input.email,
        password: "hashed:SenhaForte1",
        provider: "LOCAL",
      },
    });
    expect(mockEmailCodeCreate).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(result.user).toEqual({
      id: "user-1",
      username: "henrique",
      email: "henrique@uem.com",
      role: "USER",
      avatarUrl: null,
      emailVerified: false,
    });
  });
});

describe("verifyEmail", () => {
  it("lança 400 se o usuário não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(authService.verifyEmail("x@uem.com", "123456")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("lança 400 se o email já foi verificado", async () => {
    mockFindUnique.mockResolvedValue(userRecord({ emailVerified: true }));

    await expect(authService.verifyEmail("x@uem.com", "123456")).rejects.toMatchObject({
      statusCode: 400,
      message: "Este email já foi verificado.",
    });
  });

  it("lança 400 se não existe código pendente", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockEmailCodeFindFirst.mockResolvedValue(null);

    await expect(authService.verifyEmail("x@uem.com", "123456")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("lança 400 se o código não confere", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockEmailCodeFindFirst.mockResolvedValue({ id: "code-1", codeHash: "hashed:000000" });
    mockCompare.mockResolvedValue(false);

    await expect(authService.verifyEmail("x@uem.com", "123456")).rejects.toMatchObject({
      statusCode: 400,
      message: "Código inválido ou expirado.",
    });
  });

  it("verifica o email, consome o código e emite tokens", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockEmailCodeFindFirst.mockResolvedValue({ id: "code-1", codeHash: "hashed:123456" });
    mockCompare.mockResolvedValue(true);
    mockTransaction.mockResolvedValue([
      userRecord({ emailVerified: true }),
      { id: "code-1", consumedAt: new Date() },
    ]);
    mockRefreshCreate.mockResolvedValue({ id: "rt-1" });

    const result = await authService.verifyEmail("x@uem.com", "123456");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockRefreshCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      user: expect.objectContaining({ id: "user-1", emailVerified: true }),
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });
});

describe("login", () => {
  const input = { email: "henrique@uem.com", password: "SenhaForte1" };

  it("lança 401 para email inexistente", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 401,
      message: "Email ou senha inválidos.",
    });
  });

  it("orienta o usuário a entrar com Google quando a conta não tem senha", async () => {
    mockFindUnique.mockResolvedValue(userRecord({ password: null }));

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 400,
      message: "Esta conta usa login com Google. Entre com o Google.",
    });
  });

  it("lança 401 para senha incorreta", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockCompare.mockResolvedValue(false);

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 401,
      message: "Email ou senha inválidos.",
    });
  });

  it("lança 403 se o email não foi confirmado", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockCompare.mockResolvedValue(true);

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 403,
      message: "Confirme seu email antes de entrar.",
    });
  });

  it("retorna usuário e tokens em caso de sucesso", async () => {
    mockFindUnique.mockResolvedValue(userRecord({ emailVerified: true }));
    mockCompare.mockResolvedValue(true);
    mockRefreshCreate.mockResolvedValue({ id: "rt-1" });

    const result = await authService.login(input);

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.user.emailVerified).toBe(true);
  });
});

describe("refreshTokens", () => {
  const stored = {
    id: "rt-1",
    userId: "user-1",
    tokenHash: "hashed:refresh-token",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  it("lança 401 se o refresh token é inválido", async () => {
    mockVerifyRefresh.mockImplementation(() => {
      throw new Error("invalid");
    });

    await expect(authService.refreshTokens("bad-token")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("lança 401 se o token armazenado não existe ou está revogado", async () => {
    mockVerifyRefresh.mockReturnValue({ sub: "user-1", jti: "rt-1", tokenType: "refresh" });
    mockRefreshFindUnique.mockResolvedValue(null);

    await expect(authService.refreshTokens("token")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("revoga todos os tokens quando o hash não confere (rotação/uso indevido)", async () => {
    mockVerifyRefresh.mockReturnValue({ sub: "user-1", jti: "rt-1", tokenType: "refresh" });
    mockRefreshFindUnique.mockResolvedValue(stored);
    mockCompare.mockResolvedValue(false);

    await expect(authService.refreshTokens("token-roubado")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revoga o token antigo e emite um novo par", async () => {
    mockVerifyRefresh.mockReturnValue({ sub: "user-1", jti: "rt-1", tokenType: "refresh" });
    mockRefreshFindUnique.mockResolvedValue(stored);
    mockCompare.mockResolvedValue(true);
    mockFindUnique.mockResolvedValue(userRecord({ emailVerified: true }));
    mockRefreshUpdate.mockResolvedValue({ ...stored, revokedAt: new Date() });
    mockRefreshCreate.mockResolvedValue({ id: "rt-2" });

    const result = await authService.refreshTokens("refresh-token");

    expect(mockRefreshUpdate).toHaveBeenCalledWith({
      where: { id: "rt-1" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockRefreshCreate).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
  });
});

describe("logout", () => {
  it("revoga o token se o JWT for válido", async () => {
    mockVerifyRefresh.mockReturnValue({ sub: "user-1", jti: "rt-1", tokenType: "refresh" });
    mockRefreshUpdateMany.mockResolvedValue({ count: 1 });

    await authService.logout("refresh-token");

    expect(mockRefreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "rt-1" }) }),
    );
  });

  it("não lança erro se o token for inválido", async () => {
    mockVerifyRefresh.mockImplementation(() => {
      throw new Error("invalid");
    });

    await expect(authService.logout("bad-token")).resolves.toBeUndefined();
  });
});

describe("getCurrentUser", () => {
  it("lança 404 se o usuário não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(authService.getCurrentUser("user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Usuário não encontrado.",
    });
  });

  it("retorna o DTO público do usuário", async () => {
    mockFindUnique.mockResolvedValue(userRecord());

    const result = await authService.getCurrentUser("user-1");

    expect(result).not.toHaveProperty("password");
    expect(result).toHaveProperty("username", "henrique");
  });
});

describe("loginWithGoogle", () => {
  const googleUser = { sub: "google-1", email: "g@uem.com", email_verified: true, name: "G" };

  it("emite tokens para usuário já vinculado ao Google", async () => {
    mockGetGoogleUser.mockResolvedValue(googleUser);
    mockFindUnique.mockResolvedValue(userRecord({ googleId: "google-1", emailVerified: true }));
    mockRefreshCreate.mockResolvedValue({ id: "rt-1" });

    const result = await authService.loginWithGoogle("code");

    expect(result.user.id).toBe("user-1");
    expect(result.accessToken).toBe("access-token");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("vincula a conta Google a um usuário local com o mesmo email", async () => {
    mockGetGoogleUser.mockResolvedValue(googleUser);
    mockFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(userRecord());
    mockUserUpdate.mockResolvedValue(userRecord({ googleId: "google-1", emailVerified: true }));

    await authService.loginWithGoogle("code");

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ googleId: "google-1", emailVerified: true }),
    });
  });

  it("cria um novo usuário com provider GOOGLE quando não há conta", async () => {
    mockGetGoogleUser.mockResolvedValue(googleUser);
    mockFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue(
      userRecord({ googleId: "google-1", provider: "GOOGLE", emailVerified: true }),
    );
    mockRefreshCreate.mockResolvedValue({ id: "rt-1" });

    const result = await authService.loginWithGoogle("code");

    expect(mockUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "g@uem.com", provider: "GOOGLE", googleId: "google-1" }),
    });
    expect(result.user.id).toBe("user-1");
  });

  it("propaga erro quando o Google falha", async () => {
    mockGetGoogleUser.mockRejectedValue(new AppError("Falha no Google", 401));

    await expect(authService.loginWithGoogle("code")).rejects.toMatchObject({ statusCode: 401 });
  });
});
