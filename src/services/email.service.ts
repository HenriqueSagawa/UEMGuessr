import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const transporter =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;
 
export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  if (!transporter) {
    logger.warn(`[email:dev] Código de verificação para ${to}: ${code}`);
    return;
  }
 
  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: "Confirme seu email — UEMGuessr",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Confirme seu cadastro no UEMGuessr</h2>
          <p>Use o código abaixo para confirmar seu email. Ele expira em 15 minutos.</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</p>
          <p>Se você não solicitou este cadastro, pode ignorar este email.</p>
        </div>
      `,
    });
    logger.info(`[email] Email de verificação enviado para ${to}. MessageId: ${info.messageId}`);
  } catch (error) {
    logger.error(`[email] Erro ao enviar email de verificação para ${to}:`);
    throw error;
  }
}

export async function sendPasswordResetCodeEmail(to: string, code: string): Promise<void> {
  if (!transporter) {
    logger.warn(`[email:dev] Código de redefinição de senha para ${to}: ${code}`);
    return;
  }
 
  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: "Redefinição de senha — UEMGuessr",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Redefinição de senha no UEMGuessr</h2>
          <p>Use o código abaixo para definir uma nova senha. Ele expira em 15 minutos.</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</p>
          <p>Se você não solicitou esta redefinição, pode ignorar este email.</p>
        </div>
      `,
    });
    logger.info(`[email] Email de redefinição enviado para ${to}. MessageId: ${info.messageId}`);
  } catch (error) {
    logger.error(`[email] Erro ao enviar email de redefinição para ${to}:`);
    throw error;
  }
}