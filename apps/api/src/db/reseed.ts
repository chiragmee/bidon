/**
 * pnpm db:seed / demo:reset — replace everything in a LOCAL database with the canonical seed (dates relative to now).
 * Truncates every table, so it refuses any database that isn't on this machine (docs/PHASE1_MVP.md, D-087):
 * the live database is never reset or reseeded.
 */
import { isLocalDatabaseUrl } from '../env';
import { createSql } from './client';
import { reseed } from './repo';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. For local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  process.exit(1);
}
if (!isLocalDatabaseUrl(url)) {
  console.error('Refusing to reseed: DATABASE_URL is not a local database. Reseeding deletes every row and is never run against the live database.');
  process.exit(1);
}
const sql = createSql(url, 1);
const r = await reseed(sql);
console.log(`Seeded ${r.lots} lots (dates relative to ${r.seededAt}).`);
await sql.end();
