import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  DATA_MODE: z.enum(['demo', 'supabase']).default('demo'),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /**
   * Presenter-only controls: data reset, closing an auction early, a simulated failed EMD payment.
   * Off by default against a real database, so a live deployment never exposes them.
   */
  DEMO_CONTROLS_ENABLED: z.enum(['true', 'false']).optional(),
});

export type Env = Omit<z.infer<typeof EnvSchema>, 'DEMO_CONTROLS_ENABLED'> & { DEMO_CONTROLS_ENABLED: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.parse(source);
  const env: Env = { ...parsed, DEMO_CONTROLS_ENABLED: (parsed.DEMO_CONTROLS_ENABLED ?? (parsed.DATA_MODE === 'demo' ? 'true' : 'false')) === 'true' };
  if (env.DATA_MODE === 'supabase' && !env.DATABASE_URL) {
    throw new Error('DATA_MODE=supabase needs DATABASE_URL. Set it, or use DATA_MODE=demo for the in-memory seed.');
  }
  return env;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
}
