import { createApp } from './app';
import { createSql } from './db/client';
import { loadEnv } from './env';
import { DbService } from './services/DbService';
import { MemoryService } from './services/MemoryService';

const env = loadEnv();
const service = env.DATA_MODE === 'supabase' && env.DATABASE_URL ? new DbService(createSql(env.DATABASE_URL), { hideSamples: !env.SAMPLE_DATA_VISIBLE }) : new MemoryService();
createApp(env, service).listen(env.PORT, () => {
  console.log(`Bid ON API listening on :${env.PORT} (data: ${env.DATA_MODE}, sample data ${env.SAMPLE_DATA_VISIBLE ? 'shown' : 'hidden'}, presenter controls ${env.DEMO_CONTROLS_ENABLED ? 'on' : 'off'})`);
});
