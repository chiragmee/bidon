import cors from 'cors';
import express from 'express';
import type { Env } from './env.js';
import { allowedOrigins } from './env.js';
import { errorHandler, notFound } from './errors.js';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins(env), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: env.DATA_MODE, time: new Date().toISOString() });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
