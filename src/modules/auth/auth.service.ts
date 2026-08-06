import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { generateSixDigitCode } from "../../utils/generateCode";
import { hashValue, compareValue } from "../../lib/hash";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../../lib/jwt";
import { getGoogleUser } from "../../lib/GoogleOAuth";
import { sendVerificationCodeEmail, sendPasswordResetCodeEmail } from "../../services/email.service";
import type { RegisterInput, LoginInput, ResetPasswordInput } from "./auth.schemas";

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function publicUser(user: {
  id: string;
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
  };
}

async function issueTokenPair(userId: string, role: string) {
  const refreshTokenId = crypto.randomUUID();
 
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, jti: refreshTokenId });
 
  await prisma.refreshToken.create({
    data: {
      id: refreshTokenId,
      userId,
      tokenHash: await hashValue(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
 
  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
  });
 
  if (existing) {
    throw new AppError(
      existing.email === input.email ? "Este email já está em uso." : "Este nome de usuário já está em uso.",
      409,
    );
  }
 
  const passwordHash = await hashValue(input.password);
 
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      password: passwordHash,
      provider: "LOCAL",
    },
  });
 
  await issueVerificationCode(user.id, user.email);
 
  return { user: publicUser(user) };
}

async function issueVerificationCode(userId: string, email: string) {
  const code = generateSixDigitCode();
 
  await prisma.emailVerificationCode.create({
    data: {
      userId,
      codeHash: await hashValue(code),
      expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    },
  });
 
  await sendVerificationCodeEmail(email, code);
}

export async function resendVerificationCode(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
 
  if (!user || user.emailVerified) return;
 
  await issueVerificationCode(user.id, user.email);
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Não revela se o email existe nem se a conta é de login com Google.
  if (!user || !user.password) return;

  await issuePasswordResetCode(user.id, user.email);
}

async function issuePasswordResetCode(userId: string, email: string) {
  const code = generateSixDigitCode();

  await prisma.passwordResetCode.create({
    data: {
      userId,
      codeHash: await hashValue(code),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  await sendPasswordResetCodeEmail(email, code);
}

export async function resetPassword(input: ResetPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.password) throw new AppError("Código inválido ou expirado.", 400);

  const pendingCode = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!pendingCode) throw new AppError("Código inválido ou expirado.", 400);

  const isValid = await compareValue(input.code, pendingCode.codeHash);
  if (!isValid) throw new AppError("Código inválido ou expirado.", 400);

  const passwordHash = await hashValue(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: passwordHash } }),
    prisma.passwordResetCode.update({
      where: { id: pendingCode.id },
      data: { consumedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function verifyEmail(email: string, code: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError("Código inválido ou expirado.", 400);
  if (user.emailVerified) throw new AppError("Este email já foi verificado.", 400);
 
  const pendingCode = await prisma.emailVerificationCode.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
 
  if (!pendingCode) throw new AppError("Código inválido ou expirado.", 400);
 
  const isValid = await compareValue(code, pendingCode.codeHash);
  if (!isValid) throw new AppError("Código inválido ou expirado.", 400);
 
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    prisma.emailVerificationCode.update({
      where: { id: pendingCode.id },
      data: { consumedAt: new Date() },
    }),
  ]);
 
  const tokens = await issueTokenPair(updatedUser.id, updatedUser.role);
 
  return { user: publicUser(updatedUser), ...tokens };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
 
  if (!user || !user.password) {
    if (user && !user.password) {
      throw new AppError("Esta conta usa login com Google. Entre com o Google.", 400);
    }
    throw new AppError("Email ou senha inválidos.", 401);
  }
 
  const isValid = await compareValue(input.password, user.password);
  if (!isValid) throw new AppError("Email ou senha inválidos.", 401);
 
  if (!user.emailVerified) {
    throw new AppError("Confirme seu email antes de entrar.", 403);
  }
 
  const tokens = await issueTokenPair(user.id, user.role);
 
  return { user: publicUser(user), ...tokens };
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Refresh token inválido ou expirado.", 401);
  }
 
  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
 
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError("Refresh token inválido ou expirado.", 401);
  }
 
  const matches = await compareValue(refreshToken, stored.tokenHash);
  if (!matches) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError("Refresh token inválido ou expirado.", 401);
  }
 
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) throw new AppError("Usuário não encontrado.", 401);
 
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const tokens = await issueTokenPair(user.id, user.role);
 
  return { user: publicUser(user), ...tokens };
}

export async function logout(refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
  }
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Usuário não encontrado.", 404);
  return publicUser(user);
}

export async function loginWithGoogle(code: string) {
  const googleUser = await getGoogleUser(code);
 
  let user = await prisma.user.findUnique({ where: { googleId: googleUser.sub } });
 
  if (!user) {
    // Se já existe uma conta local com este email, vincula a conta Google a ela
    const existingByEmail = await prisma.user.findUnique({ where: { email: googleUser.email } });
 
    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId: googleUser.sub,
          emailVerified: true,
          avatarUrl: existingByEmail.avatarUrl ?? googleUser.picture ?? null,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          username: await generateUniqueUsername(googleUser.email, googleUser.name),
          email: googleUser.email,
          provider: "GOOGLE",
          googleId: googleUser.sub,
          emailVerified: true,
          avatarUrl: googleUser.picture ?? null,
        },
      });
    }
  }
 
  const tokens = await issueTokenPair(user.id, user.role);
 
  return { user: publicUser(user), ...tokens };
}

async function generateUniqueUsername(email: string, name?: string) {
  const base = (name ?? email.split("@")[0] ?? "user")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20) || "user";
 
  let candidate = base;
  let attempt = 0;
 
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    attempt += 1;
    candidate = `${base}${crypto.randomInt(1000, 9999)}`;
    if (attempt > 10) throw new AppError("Não foi possível gerar um nome de usuário único.", 500);
  }
 
  return candidate;
}