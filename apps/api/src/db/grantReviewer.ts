/**
 * pnpm --filter @auctionit/api grant:reviewer <email> "<Full name>"
 *
 * Gives an existing, email-verified Supabase sign-in the internal Operations role (eligibility reviewer and claims).
 * Never offered at sign-up (docs/PHASE1_MVP.md). Refuses a sign-in that already holds a buyer or seller account —
 * there is no role switching. Run by an administrator with DATABASE_URL for the target database.
 */
import { createSql } from './client';

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();
if (!email || !name) {
  console.error('Usage: pnpm --filter @auctionit/api grant:reviewer <email> "<Full name>"');
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const sql = createSql(url, 1);
try {
  const [auth] = await sql`select id, email, email_confirmed_at from auth.users where lower(email) = lower(${email})`;
  if (!auth) throw new Error(`No sign-in exists for ${email}. They must sign up first.`);
  if (!auth.email_confirmed_at) throw new Error(`${email} hasn't verified their email yet.`);
  const [existing] = await sql`select id, role from profiles where auth_user_id = ${auth.id} or lower(email) = lower(${email})`;
  if (existing && existing.role !== 'ops') throw new Error(`${email} already holds a ${existing.role} account (${existing.id}). Accounts can't change role.`);
  if (existing) {
    console.log(`${email} is already a reviewer (${existing.id}).`);
  } else {
    await sql.begin(async (tx) => {
      await tx`select app_write_lock()`;
      const [row] = await tx`select next_id('U') as id`;
      const id = String(row?.id);
      await tx`insert into profiles (id, name, email, role, company_id, title, auth_user_id) values (${id}, ${name}, ${String(auth.email).toLowerCase()}, 'ops', null, 'Eligibility reviewer', ${auth.id})`;
      await tx`insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, to_status, at) values (next_id('AUD'), 'user', ${id}, 'grant_reviewer', 'admin-script', 'ops', 'ops', now())`;
      // Copy the role into app_metadata (server-only claims) so the web route guard sees it after the next token refresh.
      await tx`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || ${tx.json({ role: 'ops', profile_id: id })} where id = ${auth.id}`;
      console.log(`Granted the reviewer role to ${email} as ${id}.`);
    });
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
