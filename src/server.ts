import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { logger } from "./utils/logger";
import { httpLogger } from "./middlewares/httpLogger";
import { rateLimiter } from "./middlewares/rateLimiter";
import { errorHandler } from "./middlewares/errorHandler";
import routes from "./routes";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN ?? env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimiter);

app.use(httpLogger);

app.use(routes);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
    logger.info(`Servidor rodando na porta ${env.PORT} em modo [${env.NODE_ENV}]`);
})

async function gracefulShutdown(signal: string) {
  logger.info(`Recebido sinal ${signal}. Encerrando aplicação graciosamente...`);

  server.close(async () => {
    logger.info('Servidor HTTP encerrado.');

    try {
      await prisma.$disconnect();
      logger.info('Conexão com o banco de dados (Prisma) desconectada.');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Erro ao desconectar do banco de dados.');
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Não foi possível fechar as conexões a tempo. Forçando saída.');
    process.exit(1);
  }, 10000);

}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));