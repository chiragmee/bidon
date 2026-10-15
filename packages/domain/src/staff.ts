/**
 * Operations staff (D-102): one master admin sees every region and appoints reviewers; a reviewer sees and decides
 * only applications from their regions. Pure over a state snapshot, like eligibility.ts. The API enforces the same
 * rules by calling these functions; the UI only reflects them.
 */
import type { Actor } from './context';
import { audit } from './context';
import type { OpResult } from './operations';
import { clone, stateCtx } from './operations';
import { REGIONS, isRegion, regionOf, stateByCode, type Region } from './regions';
import type { DemoState } from './seed';
import type { Company, Iso, StaffLevel, User } from './types';

export interface StaffAccess {
  userId: string;
  level: Exclude<StaffLevel, 'removed'>;
  /** Regions this person covers; an admin covers all. */
  regions: readonly Region[];
}

/** What a signed-in Operations user may see, or null when they aren't (or are no longer) staff. */
export function staffAccess(state: DemoState, userId: string | null | undefined): StaffAccess | null {
  const u = userId ? state.users.find((x) => x.id === userId) : undefined;
  if (!u || u.role !== 'ops' || u.staffLevel === 'removed') return null;
  if (u.staffLevel === 'admin') return { userId: u.id, level: 'admin', regions: REGIONS };
  // No level recorded = a reviewer with only the regions listed (none → sees nothing): fail closed.
  return { userId: u.id, level: 'reviewer', regions: (u.regions ?? []).filter(isRegion) };
}

/** The region an application belongs to (null until the applicant gives a state). */
export const companyRegion = (c: Company): Region | null => regionOf(c.eligibility?.state);

/** Whether this staff member covers a company. Applications without a region are the admin's alone. */
export function coversCompany(access: StaffAccess | null, company: Company): boolean {
  if (!access) return false;
  if (access.level === 'admin') return true;
  const r = companyRegion(company);
  return r !== null && access.regions.includes(r);
}

/** Active staff who should hear about an application in this region: the admin(s) and its reviewers. */
export function staffForRegion(state: DemoState, region: Region | null): User[] {
  return state.users.filter((u) => {
    const a = staffAccess(state, u.id);
    return !!a && (a.level === 'admin' || (region !== null && a.regions.includes(region)));
  });
}

function rejected<T>(state: DemoState, code: string, what: string, next: string): OpResult<T> {
  return { ok: false, state, error: { code, what, next } };
}

const adminOnly = <T>(state: DemoState, actor: Actor): OpResult<T> | null =>
  staffAccess(state, actor.id)?.level === 'admin' ? null : rejected(state, 'forbidden', 'Only the AuctionIT admin can manage reviewers.', 'Ask the admin.');

function cleanRegions(regions: readonly unknown[]): Region[] {
  return REGIONS.filter((r) => regions.includes(r));
}

export interface AppointInput {
  name: string;
  email: string;
  regions: Region[];
  /** Supabase Auth user id of the invited sign-in (the API creates the invitation first). */
  authUserId: string | null;
}

/**
 * Make someone a regional reviewer. A buyer or seller can't become staff (accounts can't change role); a removed
 * reviewer is re-appointed with the new regions.
 */
export function appointReviewer(state: DemoState, input: AppointInput, actor: Actor, now: Iso): OpResult<User> {
  const denied = adminOnly<User>(state, actor);
  if (denied) return denied;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const regions = cleanRegions(input.regions);
  if (name.length < 2) return rejected(state, 'invalid_input', 'Enter the reviewer’s full name.', 'Then appoint them again.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return rejected(state, 'invalid_input', 'Enter a valid email address.', 'The invitation is sent there.');
  if (!regions.length) return rejected(state, 'invalid_input', 'Choose at least one region for the reviewer.', 'They will see applications from those regions only.');
  const existing = state.users.find((u) => u.email.toLowerCase() === email);
  if (existing && existing.role !== 'ops') {
    return rejected(state, 'duplicate_account', 'This email already belongs to a buyer or seller account.', 'Use a different email for the reviewer — one account can’t be both.');
  }
  if (existing && existing.staffLevel === 'admin') return rejected(state, 'already_staff', `${existing.name} is the admin and already sees every region.`, 'Nothing to change.');
  if (existing && existing.staffLevel !== 'removed') return rejected(state, 'already_staff', `${existing.name} is already a reviewer.`, 'Change their regions in the team list instead.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  let user: User;
  if (existing) {
    user = next.users.find((u) => u.id === existing.id) as User;
    user.staffLevel = 'reviewer';
    user.regions = regions;
    user.name = name;
    if (input.authUserId) user.authUserId = input.authUserId;
  } else {
    user = { id: ctx.newId('U'), name, email, role: 'ops', companyId: null, title: 'Eligibility reviewer', phone: null, authUserId: input.authUserId, staffLevel: 'reviewer', regions };
    next.users.push(user);
  }
  next.audit.push(audit(ctx, { entity: 'user', entityId: user.id, action: 'appoint_reviewer', to: regions.join(',') }));
  return { ok: true, state: next, value: user };
}

/** Change which regions a reviewer covers. */
export function setReviewerRegions(state: DemoState, userId: string, regions: readonly unknown[], actor: Actor, now: Iso): OpResult<User> {
  const denied = adminOnly<User>(state, actor);
  if (denied) return denied;
  const target = state.users.find((u) => u.id === userId);
  if (!target || target.role !== 'ops' || target.staffLevel === 'removed') return rejected(state, 'not_found', 'That reviewer doesn’t exist.', 'Refresh the team list.');
  if (target.staffLevel === 'admin') return rejected(state, 'forbidden', 'The admin always covers every region.', 'Nothing to change.');
  const clean = cleanRegions(regions);
  if (!clean.length) return rejected(state, 'invalid_input', 'Choose at least one region.', 'To stop someone reviewing, remove them instead.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const u = next.users.find((x) => x.id === userId) as User;
  const from = (u.regions ?? []).join(',');
  u.regions = clean;
  next.audit.push(audit(ctx, { entity: 'user', entityId: u.id, action: 'set_reviewer_regions', from, to: clean.join(',') }));
  return { ok: true, state: next, value: u };
}

/** Take away a reviewer's access. Their profile and past decisions stay on record. */
export function removeReviewer(state: DemoState, userId: string, actor: Actor, now: Iso): OpResult<User> {
  const denied = adminOnly<User>(state, actor);
  if (denied) return denied;
  const target = state.users.find((u) => u.id === userId);
  if (!target || target.role !== 'ops' || target.staffLevel === 'removed') return rejected(state, 'not_found', 'That reviewer doesn’t exist.', 'Refresh the team list.');
  if (target.staffLevel === 'admin') return rejected(state, 'forbidden', 'The admin can’t be removed here.', 'Contact the AuctionIT owner.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const u = next.users.find((x) => x.id === userId) as User;
  u.staffLevel = 'removed';
  u.regions = [];
  next.audit.push(audit(ctx, { entity: 'user', entityId: u.id, action: 'remove_reviewer', to: 'removed' }));
  return { ok: true, state: next, value: u };
}

/** Admin: record the state for an application that has none (registered before regions existed). */
export function setApplicationState(state: DemoState, companyId: string, code: string, actor: Actor, now: Iso): OpResult<Company> {
  const denied = adminOnly<Company>(state, actor);
  if (denied) return denied;
  const company = state.companies.find((c) => c.id === companyId);
  if (!company?.eligibility) return rejected(state, 'not_found', 'That application does not exist.', 'Go back to the review queue.');
  const st = stateByCode(code);
  if (!st) return rejected(state, 'invalid_input', 'Choose the state of the registered address.', 'It decides which reviewers see the application.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const c = next.companies.find((x) => x.id === companyId) as Company;
  const from = c.eligibility?.state ?? '';
  c.eligibility = { ...(c.eligibility as NonNullable<Company['eligibility']>), state: st.code };
  next.audit.push(audit(ctx, { entity: 'company', entityId: c.id, action: 'set_application_state', from: from || null, to: st.code }));
  return { ok: true, state: next, value: c };
}

// ── Views ────────────────────────────────────────────────────────────────────

export interface StaffMemberView {
  id: string;
  name: string;
  email: string;
  level: Exclude<StaffLevel, 'removed'>;
  regions: Region[];
  /** Applications from their regions waiting now. */
  waiting: number;
  /** False until the invited person sets a password (API fills it in from Auth; demo: true). */
  signedIn: boolean;
}

export interface TeamView {
  members: StaffMemberView[];
  /** Waiting applications per region, plus those with no region yet (admin's). */
  waitingByRegion: Record<Region | 'unset', number>;
  /** Regions with no reviewer — only the admin sees those applications. */
  uncovered: Region[];
}

/** The team page (admin only). */
export function teamView(state: DemoState, viewerId: string): TeamView | null {
  if (staffAccess(state, viewerId)?.level !== 'admin') return null;
  const waiting = state.companies.filter((c) => c.verification === 'pending_review');
  const waitingByRegion = Object.fromEntries([...REGIONS, 'unset'].map((r) => [r, 0])) as Record<Region | 'unset', number>;
  for (const c of waiting) waitingByRegion[companyRegion(c) ?? 'unset']++;
  const members = state.users
    .map((u) => ({ u, a: staffAccess(state, u.id) }))
    .filter((x): x is { u: User; a: StaffAccess } => !!x.a)
    .map(({ u, a }) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      level: a.level,
      regions: [...a.regions],
      waiting: waiting.filter((c) => coversCompany(a, c)).length,
      signedIn: true,
    }))
    .sort((x, y) => (x.level === y.level ? x.name.localeCompare(y.name) : x.level === 'admin' ? -1 : 1));
  const covered = new Set(members.filter((m) => m.level === 'reviewer').flatMap((m) => m.regions));
  return { members, waitingByRegion, uncovered: REGIONS.filter((r) => !covered.has(r)) };
}
