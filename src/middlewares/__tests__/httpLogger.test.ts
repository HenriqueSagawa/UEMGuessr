import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { httpLogger } from '../httpLogger';

it('não registra parâmetros sensíveis da URL', () => {
  const req = {
    method: 'GET',
    originalUrl: '/auth/google/callback?code=segredo&state=nonce',
  } as Request;
  const res = new EventEmitter() as Response;
  res.statusCode = 200;
  const next = jest.fn();
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});

  httpLogger(req, res, next);
  res.emit('finish');

  expect(next).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('/auth/google/callback'));
  expect(log.mock.calls[0]?.[0]).not.toContain('segredo');
  expect(log.mock.calls[0]?.[0]).not.toContain('state=');
  log.mockRestore();
});
