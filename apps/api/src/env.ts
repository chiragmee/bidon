import { z } from 'zod';

const flag = z.enum(['true', 'false']).optional();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  DATA_MODE: z.enum(['demo', 'supabase']).default('demo'),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /**
   * Presenter-only controls: data reset, closing an auction early, the one-click demo session header.
   * Default on for DATA_MODE=demo and off otherwise — and never honoured against a non-local database (D-087).
   */
  DEMO_CONTROLS_ENABLED: flag,
  /** Seeded sample records are hidden from every view unless the database is local; `false` hides them locally too. */
  SAMPLE_DATA_VISIBLE: flag,
});

type Parsed = z.infer<typeof EnvSchema>;
export type Env = Omit<Parsed, 'DEMO_CONTROLS_ENABLED' | 'SAMPLE_DATA_VISIBLE'> & {
  DEMO_CONTROLS_ENABLED: boolean;
  SAMPLE_DATA_VISIBLE: boolean;
  /** In-memory demo, or a Postgres on this machine (supabase start). Everything else is treated as production. */
  LOCAL_DATA: boolean;
};

/** Hosts that can only be a developer's own database. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.parse(source);
  if (parsed.DATA_MODE === 'supabase' && !parsed.DATABASE_URL) {
    throw new Error('DATA_MODE=supabase needs DATABASE_URL. Set it, or use DATA_MODE=demo for the in-memory seed.');
  }
  const local = parsed.DATA_MODE === 'demo' || isLocalDatabaseUrl(parsed.DATABASE_URL);
  const wantControls = (parsed.DEMO_CONTROLS_ENABLED ?? (parsed.DATA_MODE === 'demo' ? 'true' : 'false')) === 'true';
  if (wantControls && !local) {
    // A mistaken variable on the live service must not expose reset or impersonation (docs/PHASE1_MVP.md).
    console.warn('DEMO_CONTROLS_ENABLED ignored: the database is not local.');
  }
  return {
    ...parsed,
    LOCAL_DATA: local,
    DEMO_CONTROLS_ENABLED: wantControls && local,
    SAMPLE_DATA_VISIBLE: local && parsed.SAMPLE_DATA_VISIBLE !== 'false',
  };
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
}
