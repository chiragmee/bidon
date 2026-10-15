import cors from 'cors';
import express from 'express';
import type { Env } from './env';
import { allowedOrigins } from './env';
import { errorHandler, notFound } from './errors';
import { createRouter, type ApiService } from './routes';
import { createMediaStore, type MediaStore } from './services/storage';

export function createApp(env: Env, service: ApiService, media: MediaStore = createMediaStore(env)) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins(env), credentials: true, allowedHeaders: ['content-type', 'x-demo-session'] }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: env.DATA_MODE, time: new Date().toISOString() });
  });

  app.use((req, res, next) => (req.path === '/media' ? next() : express.json({ limit: '1mb' })(req, res, next)));
  app.use(createRouter(service, media, env));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
