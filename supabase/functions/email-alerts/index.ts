// Emails queued alerts (D-101): reviewers hear about new account applications without watching the Ops page.
//
// Called with an empty POST by the notifications trigger and every 10 minutes by pg_cron
// (supabase/migrations/20261016000003_email_alerts.sql). It ignores the request body and only sends what is queued,
// so the URL needs no secret. `?check=1` logs in to the mail server and sends nothing.
//
// Secrets: SMTP_USER, SMTP_PASS (Gmail app password), optional SMTP_HOST/SMTP_PORT/SMTP_SECURE (default
// smtp.gmail.com:465 over TLS — Edge Functions can't use port 587) and SITE_URL. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; the queue is reached through claim_email_alerts / release_email_alerts.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import nodemailer from 'npm:nodemailer@6.10.1';

const MAX_ATTEMPTS = 5;
const BATCH = 20;


const env = (k: string, fallback?: string) => Deno.env.get(k) ?? fallback;
const siteUrl = (env('SITE_URL', 'https://bidonindia.vercel.app') as string).replace(/\/$/, '');
const user = env('SMTP_USER');

const db = createClient(env('SUPABASE_URL') as string, env('SUPABASE_SERVICE_ROLE_KEY') as string, { auth: { persistSession: false } });
const mailer = nodemailer.createTransport({
  host: env('SMTP_HOST', 'smtp.gmail.com'),
  port: Number(env('SMTP_PORT', '465')),
  secure: env('SMTP_SECURE', 'true') === 'true',
  auth: user ? { user, pass: env('SMTP_PASS') } : undefined,
});
const from = { name: 'Bid ON', address: env('SMTP_FROM', user ?? 'no-reply@auctionit.local') as string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Alert {
  alert_id: string;
  title: string;
  body: string;
  href: string;
  email: string;
  name: string;
}

function message(a: Alert) {
  const link = `${siteUrl}${a.href}`;
  const queue = `${siteUrl}/ops/eligibility`;
  return {
    from,
    to: { name: a.name, address: a.email },
    subject: `New application: ${a.title}`,
    text: `${a.title}.\n${a.body}\n\nReview it: ${link}\nAll waiting applications: ${queue}\n\nYou get this because you're a Bid ON reviewer.`,
    html: `<p><strong>${escape(a.title)}.</strong><br>${escape(a.body)}</p>
<p><a href="${escape(link)}" style="display:inline-block;padding:10px 16px;background:#0F4C5C;color:#fff;border-radius:6px;text-decoration:none">Review the application</a></p>
<p><a href="${escape(queue)}">All waiting applications</a></p>
<p style="color:#666;font-size:12px">You get this because you're a Bid ON reviewer.</p>`,
  };
}

/** Claim a batch (so overlapping runs never send twice), send each, and put failures back for a later run. */
async function drain() {
  const { data, error } = await db.rpc('claim_email_alerts', { batch: BATCH, max_attempts: MAX_ATTEMPTS });
  if (error) throw new Error(`claim_email_alerts: ${error.message}`);
  const alerts = (data ?? []) as Alert[];
  let sent = 0;
  const failed: string[] = [];
  for (const a of alerts) {
    if (!a.email) continue;
    try {
      await mailer.sendMail(message(a));
      sent++;
    } catch (e) {
      console.error(`email-alerts: ${a.alert_id} not sent: ${(e as Error).message}`);
      failed.push(a.alert_id);
    }
  }
  if (failed.length) {
    const { error: releaseError } = await db.rpc('release_email_alerts', { ids: failed });
    if (releaseError) console.error(`email-alerts: release failed: ${releaseError.message}`);
  }
  return { sent, failed: failed.length };
}

Deno.serve(async (req) => {
  try {
    if (new URL(req.url).searchParams.get('check')) {
      await mailer.verify();
      return json({ smtp: 'ok' });
    }
    return json(await drain());
  } catch (e) {
    console.error(`email-alerts: ${(e as Error).message}`);
    return json({ error: 'email alerts failed — see the function logs' }, 500);
  }
});
