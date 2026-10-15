/**
 * pnpm --filter @auctionit/api invite:reviewer <email> "<Full name>"
 *
 * Makes someone an AuctionIT reviewer (the internal Operations role: eligibility review and claims). Never offered at
 * sign-up (D-087). Run by an administrator with the target project's DATABASE_URL, SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY; SITE_URL is where the invite link lands (default: the live site).
 *
 *   - No sign-in yet → Supabase emails an invitation; the link opens /auth/invite to choose a password.
 *   - Already signed up and verified, without a buyer/seller account → the role is granted straight away.
 *   - Already a buyer or seller → refused: accounts can't change role.
 */
import { createClient } from '@supabase/supabase-js';
import { createSql } from './client';

const [rawEmail, ...nameParts] = process.argv.slice(2);
const email = (rawEmail ?? '').trim().toLowerCase();
const name = nameParts.join(' ').trim();
const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const SITE_URL = (process.env.SITE_URL ?? 'https://auctionit-sand.vercel.app').replace(/\/$/, '');
if (!email || !name) {
  console.error('Usage: pnpm --filter @auctionit/api invite:reviewer <email> "<Full name>"');
  process.exit(2);
}
if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the target project.');
  process.exit(2);
}

const sql = createSql(DATABASE_URL, 1);
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

try {
  const [existing] = await sql`select id, role from profiles where lower(email) = ${email}`;
  if (existing && existing.role !== 'ops') throw new Error(`${email} already holds a ${existing.role} account (${existing.id}). Accounts can't change role.`);

  const [found] = await sql`select id, email_confirmed_at from auth.users where lower(email) = ${email}`;
  let authId = found ? String(found.id) : '';
  let invited = false;
  if (!found?.email_confirmed_at) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${SITE_URL}/auth/invite`, data: { invited_as: 'reviewer', name } });
    if (error) throw new Error(`Supabase couldn't send the invitation: ${error.message}`);
    authId = data.user.id;
    invited = true;
  }

  let profileId = existing ? String(existing.id) : '';
  if (!existing) {
    await sql.begin(async (tx) => {
      await tx`select app_write_lock()`;
      const [row] = await tx`select next_id('U') as id`;
      profileId = String(row?.id);
      await tx`insert into profiles (id, name, email, role, company_id, title, auth_user_id) values (${profileId}, ${name}, ${email}, 'ops', null, 'Eligibility reviewer', ${authId})`;
      await tx`insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, to_status, at) values (next_id('AUD'), 'user', ${profileId}, ${invited ? 'invite_reviewer' : 'grant_reviewer'}, 'admin-script', 'ops', 'ops', now())`;
    });
  }
  // Role and profile id in app_metadata (server-only) let the web route guard recognise the reviewer.
  const { error: metaError } = await admin.auth.admin.updateUserById(authId, { app_metadata: { role: 'ops', profile_id: profileId } });
  if (metaError) throw new Error(`Profile ${profileId} created, but the role couldn't be copied to the sign-in: ${metaError.message}`);

  console.log(
    invited
      ? `Invitation sent to ${email} (reviewer ${profileId}). They open the email, choose a password, and land in Operations.`
      : `${email} is now a reviewer (${profileId}). They can sign in now.`,
  );
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
