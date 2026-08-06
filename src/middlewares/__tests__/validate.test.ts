import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validate } from "../validate";
import { AppError } from "../../utils/appError";

function mockRes() {
  return {} as Response;
}

describe("validate", () => {
  const schema = z.object({ email: z.email(), password: z.string().min(6) });

  it("chama next() com o body validado quando os dados são válidos", () => {
    const req = { body: { email: "teste@uem.com", password: "123456" } } as Request;
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: "teste@uem.com", password: "123456" });
  });

  it("chama next() com AppError 422 quando os dados são inválidos", () => {
    const req = { body: { email: "email-invalido", password: "123" } } as Request;
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBeTruthy();
  });
});
