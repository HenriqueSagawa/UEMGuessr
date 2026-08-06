jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

jest.mock("../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const OLD_ENV = process.env;

afterEach(() => {
  process.env = { ...OLD_ENV };
  jest.resetModules();
});

describe("sendPasswordResetCodeEmail", () => {
  it("apenas loga o código quando não há SMTP configurado (modo dev)", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    jest.resetModules();
    const { sendPasswordResetCodeEmail } = await import("../email.service");
    const { logger } = await import("../../utils/logger");

    await sendPasswordResetCodeEmail("a@uem.com", "123456");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Código de redefinição de senha para a@uem.com: 123456"),
    );
  });

  it("envia o email com o código e o assunto correto quando o SMTP está configurado", async () => {
    process.env.SMTP_HOST = "smtp.teste.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "UEMGuessr <no-reply@uemguessr.com>";

    jest.resetModules();
    const { createTransport } = await import("nodemailer");
    const sendMail = jest.fn().mockResolvedValue({ messageId: "msg-1" });
    (createTransport as jest.Mock).mockReturnValue({ sendMail });

    const { sendPasswordResetCodeEmail } = await import("../email.service");
    await sendPasswordResetCodeEmail("a@uem.com", "123456");

    expect(createTransport).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "UEMGuessr <no-reply@uemguessr.com>",
        to: "a@uem.com",
        subject: "Redefinição de senha — UEMGuessr",
        html: expect.stringContaining("123456"),
      }),
    );
  });
});
