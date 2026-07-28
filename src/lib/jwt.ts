import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
    sub: string;
    role: string;
    tokenType: "access";
}

export interface RefreshTokenPayload {
    sub: string;
    jti: string;
    tokenType: "refresh";
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "tokenType">): string {
  return jwt.sign(
    { ...payload, tokenType: "access" } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as SignOptions,
  );
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "tokenType">): string {
  return jwt.sign(
    { ...payload, tokenType: "refresh" } satisfies RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions,
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.tokenType !== "access") throw new Error("Tipo de token inválido.");
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (decoded.tokenType !== "refresh") throw new Error("Tipo de token inválido.");
  return decoded;
}