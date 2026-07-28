import { env } from '../config/env';
import { AppError } from '../utils/appError';

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleUserInfo {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
 
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}


export async function getGoogleUser(code: string): Promise<GoogleUserInfo> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code,
    }),
  });
 
  if (!tokenResponse.ok) {
    throw new AppError("Não foi possível validar a autenticação com o Google.", 401);
  }
 
  const tokenData = (await tokenResponse.json()) as { access_token: string };
 
  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
 
  if (!userResponse.ok) {
    throw new AppError("Não foi possível obter os dados do usuário do Google.", 401);
  }
 
  const user = (await userResponse.json()) as GoogleUserInfo;
 
  if (!user.email_verified) {
    throw new AppError("O email da conta Google não está verificado.", 401);
  }
 
  return user;
}