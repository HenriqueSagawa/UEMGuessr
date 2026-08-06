import type { Request, Response, NextFunction } from "express";
import { authenticate, requireRole } from "../authenticate";
import { AppError } from "../../utils/appError";

jest.mock("../../lib/jwt", () => ({
  verifyAccessToken: jest.fn(),
}));

import { verifyAccessToken } from "../../lib/jwt";
const mockVerify = jest.mocked(verifyAccessToken);

function mockRes() {
  return {} as Response;
}

describe("authenticate", () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  it("rejeita quando o header Authorization está ausente", () => {
    const req = { headers: {} } as Request;
    const next = jest.fn();

    authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it("rejeita quando o header não usa Bearer", () => {
    const req = { headers: { authorization: "Basic abc" } } as Request;
    const next = jest.fn();

    authenticate(req, mockRes(), next);

    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it("rejeita quando o token é inválido ou expirado", () => {
    mockVerify.mockImplementation(() => {
      throw new Error("invalid token");
    });

    const req = { headers: { authorization: "Bearer token-que-falha" } } as Request;
    const next = jest.fn();

    authenticate(req, mockRes(), next);

    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it("define req.user e chama next() sem erro para token válido", () => {
    mockVerify.mockReturnValue({ sub: "user-123", role: "ADMIN", tokenType: "access" });

    const req = { headers: { authorization: "Bearer token-valido" } } as Request;
    const next = jest.fn();

    authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: "user-123", role: "ADMIN" });
  });
});

describe("requireRole", () => {
  it("rejeita quando não há usuário autenticado", () => {
    const req = {} as Request;
    const next = jest.fn();

    requireRole("ADMIN")(req, mockRes(), next);

    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("rejeita quando o papel do usuário não é permitido", () => {
    const req = { user: { id: "u1", role: "USER" } } as Request;
    const next = jest.fn();

    requireRole("ADMIN")(req, mockRes(), next);

    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err.statusCode).toBe(403);
  });

  it("chama next() sem erro quando o papel é permitido", () => {
    const req = { user: { id: "u1", role: "ADMIN" } } as Request;
    const next = jest.fn();

    requireRole("ADMIN", "MODERATOR")(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
