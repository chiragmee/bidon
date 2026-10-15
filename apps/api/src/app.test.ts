import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadEnv } from './env';

import { MemoryService } from './services/MemoryService';

const app = createApp(loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000' }), new MemoryService());

describe('api shell', () => {
  it('GET /health answers ok with mode and server time', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', mode: 'demo' });
    expect(Date.parse(res.body.time)).not.toBeNaN();
  });

  it('unknown route returns the standard error shape', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'not_found',
      message: expect.any(String),
      what: expect.any(String),
      next: expect.any(String),
    });
  });

  it('allows the configured web origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not allow other origins', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
