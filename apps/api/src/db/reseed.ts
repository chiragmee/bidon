/** pnpm db:seed / demo:reset — reload the canonical seed into the database (dates relative to now). */
import { createSql } from './client';
import { reseed } from './repo';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. For local Supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  process.exit(1);
}
const sql = createSql(url, 1);
const r = await reseed(sql);
console.log(`Seeded ${r.lots} lots (dates relative to ${r.seededAt}).`);
await sql.end();
