import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { AppError } from "../../utils/appError";
import { buildGoogleAuthUrl } from "../../lib/GoogleOAuth";
import * as authService from "./auth.service";

const isProduction = env.NODE_ENV === "production";

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    return res.status(201).json({
      status: "success",
      message: "Cadastro realizado. Verifique seu email para confirmar a conta.",
      data: result.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = req.body;
    const { user, accessToken, refreshToken } = await authService.verifyEmail(email, code);

    setRefreshCookie(res, refreshToken);
    return res.status(200).json({ status: "success", data: { user, accessToken, refreshToken } });
  } catch (error) {
    next(error);
  }
}

export async function resendCode(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.resendVerificationCode(req.body.email);
    return res.status(200).json({
      status: "success",
      message: "Se o email existir e ainda não tiver sido verificado, um novo código foi enviado.",
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body);
    setRefreshCookie(res, refreshToken);
    return res.status(200).json({ status: "success", data: { user, accessToken, refreshToken } });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new AppError("Refresh token não informado.", 401);

    const { user, accessToken, refreshToken } = await authService.refreshTokens(token);
    setRefreshCookie(res, refreshToken);
    return res.status(200).json({ status: "success", data: { user, accessToken, refreshToken } });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) await authService.logout(token);

    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
    return res.status(200).json({ status: "success", message: "Sessão encerrada." });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Não autenticado.", 401);
    const user = await authService.getCurrentUser(req.user.id);
    return res.status(200).json({ status: "success", data: user });
  } catch (error) {
    next(error);
  }
}

const GOOGLE_STATE_COOKIE = "google_oauth_state";

export function googleRedirect(_req: Request, res: Response) {
  const state = crypto.randomBytes(24).toString("hex");

  res.cookie(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 5 * 60 * 1000,
  });

  return res.redirect(buildGoogleAuthUrl(state));
}

export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const savedState = req.cookies?.[GOOGLE_STATE_COOKIE];

    res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/auth/google" });

    if (!code || !state || !savedState || state !== savedState) {
      throw new AppError("Falha na validação do login com Google (state inválido).", 401);
    }

    const { refreshToken, accessToken } = await authService.loginWithGoogle(code);
    setRefreshCookie(res, refreshToken);

    const redirectUrl = new URL("/auth/callback", env.FRONTEND_URL);
    redirectUrl.hash = `accessToken=${accessToken}`;

    return res.redirect(redirectUrl.toString());
  } catch (error) {
    next(error);
  }
}