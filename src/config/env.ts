import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url('A DATABASE_URL precisa ser uma URL válida de conexão.'),
  CORS_ORIGIN: z.string().default('*'),

  JWT_ACCESS_SECRET: z.string().min(32, "A JWT_ACCESS_SECRET precisa ter no mínimo 32 caracteres."),
  JWT_REFRESH_SECRET: z.string().min(32, "A JWT_REFRESH_SECRET precisa ter no mínimo 32 caracteres."),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string().url('A GOOGLE_REDIRECT_URI precisa ser uma URL válida.'),

  FRONTEND_URL: z.url().default('http://localhost:5173'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('UEMGuessr <no-reply@uemguessr.com>'),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Erro na validação das Variáveis de Ambiente:');
  console.error(JSON.stringify(_env.error.format(), null, 2));
  process.exit(1);
}

export const env = _env.data;