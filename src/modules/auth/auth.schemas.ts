import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "O nome de usuário precisa ter no mínimo 3 caracteres.")
    .max(30, "O nome de usuário pode ter no máximo 30 caracteres.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use apenas letras, números e underscore."),
  email: z.email("Informe um email válido."),
  password: z
    .string()
    .min(8, "A senha precisa ter no mínimo 8 caracteres.")
    .regex(/[a-z]/, "A senha precisa ter ao menos uma letra minúscula.")
    .regex(/[A-Z]/, "A senha precisa ter ao menos uma letra maiúscula.")
    .regex(/[0-9]/, "A senha precisa ter ao menos um número."),
});

export const loginSchema = z.object({
  email: z.email("Informe um email válido."),
  password: z.string().min(1, "Informe a senha."),
});

export const verifyEmailSchema = z.object({
  email: z.email("Informe um email válido."),
  code: z.string().length(6, "O código de verificação precisa ter 6 dígitos."),
});

export const resendCodeSchema = z.object({
  email: z.email("Informe um email válido."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token é obrigatório."),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Informe um email válido."),
});

export const resetPasswordSchema = z.object({
  email: z.email("Informe um email válido."),
  code: z.string().length(6, "O código de redefinição precisa ter 6 dígitos."),
  newPassword: z
    .string()
    .min(8, "A nova senha precisa ter no mínimo 8 caracteres.")
    .regex(/[a-z]/, "A nova senha precisa ter ao menos uma letra minúscula.")
    .regex(/[A-Z]/, "A nova senha precisa ter ao menos uma letra maiúscula.")
    .regex(/[0-9]/, "A nova senha precisa ter ao menos um número."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendCodeInput = z.infer<typeof resendCodeSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;