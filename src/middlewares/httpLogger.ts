import type { Request, Response, NextFunction } from 'express';

export function httpLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = performance.now();

  res.on('finish', () => {
    const duration = (performance.now() - startTime).toFixed(1);
    const { method, originalUrl } = req;
    const { statusCode } = res;

    const color =
      statusCode >= 500
        ? '\x1b[31m' 
        : statusCode >= 400
        ? '\x1b[33m' 
        : statusCode >= 300
        ? '\x1b[36m' 
        : '\x1b[32m'; 

    const reset = '\x1b[0m';
    const bold = '\x1b[1m';

    console.log(
      ` ${bold}${method}${reset} ${originalUrl} ${color}${statusCode}${reset} in ${duration}ms`
    );
  });

  next();
}