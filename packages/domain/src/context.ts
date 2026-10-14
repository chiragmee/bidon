import type { AuditEntry, Iso, Role } from './types';

export interface Actor {
  id: string;
  role: Role;
}

/**
 * Everything impure a domain function needs, passed in: the clock (server time is authoritative),
 * the acting user and an id generator. Keeps domain functions pure and deterministic in tests.
 */
export interface Ctx {
  now: Iso;
  actor: Actor;
  newId: (prefix: string) => string;
}

export function audit(
  ctx: Ctx,
  entry: Pick<AuditEntry, 'entity' | 'entityId' | 'action'> &
    Partial<Pick<AuditEntry, 'from' | 'to' | 'reason'>>,
): AuditEntry {
  return {
    id: ctx.newId('AUD'),
    actorId: ctx.actor.id,
    actorRole: ctx.actor.role,
    from: entry.from ?? null,
    to: entry.to ?? null,
    reason: entry.reason ?? null,
    at: ctx.now,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
  };
}

export const ms = (iso: Iso) => Date.parse(iso);
export const addHours = (iso: Iso, h: number) => new Date(ms(iso) + h * 3_600_000).toISOString();

/** Test/demo helper: sequential ids per prefix. */
export function sequentialIds(start = 1) {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const n = counters.get(prefix) ?? start;
    counters.set(prefix, n + 1);
    return `${prefix}-${n}`;
  };
}
