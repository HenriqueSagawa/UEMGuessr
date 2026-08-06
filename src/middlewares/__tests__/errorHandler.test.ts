import type { Request, Response } from "express";
import { errorHandler } from "../errorHandler";
import { AppError } from "../../utils/appError";

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("errorHandler", () => {
  it("responde com o status e a mensagem de um AppError", () => {
    const req = {} as Request;
    const res = mockRes();

    errorHandler(new AppError("Local não encontrado.", 404), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ status: "error", message: "Local não encontrado." });
  });

  it("responde 500 para erros genéricos", () => {
    const req = {} as Request;
    const res = mockRes();

    errorHandler(new Error("boom"), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: "error", message: "Erro interno do servidor" });
  });
});
