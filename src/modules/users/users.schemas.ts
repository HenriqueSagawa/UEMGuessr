import { z } from "zod";

export const updateProfileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "O nome de usuário precisa ter no mínimo 3 caracteres.")
      .max(30, "O nome de usuário pode ter no máximo 30 caracteres.")
      .regex(/^[a-zA-Z0-9_]+$/, "Use apenas letras, números e underscore.")
      .optional(),
    displayName: z
      .string()
      .trim()
      .max(50, "O nome de exibição pode ter no máximo 50 caracteres.")
      .optional()
      .or(z.literal("")),
    bio: z
      .string()
      .trim()
      .max(280, "A bio pode ter no máximo 280 caracteres.")
      .optional()
      .or(z.literal("")),
    themeColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "A cor precisa estar no formato hexadecimal, ex: #7C3AED.")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;