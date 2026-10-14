import {
  buyerDashboard,
  closeDemoAuction,
  listLots,
  lotDetail,
  markNotificationsRead,
  payEmd,
  placeBid,
  processDueClosures,
  registerBuyer,
  transactionSummary,
  type DemoState,
  type OpResult,
  type Viewer,
} from '@auctionit/domain';
import type { DataSource, DsResult } from './DataSource';
import { loadState, resetState, saveState, subscribe } from './demoStore';

/** sessionStorage key: name of the next operation to fail with a simulated network error. */
export const FAIL_KEY = 'auctionit:fail-next';

const delay = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
const now = () => new Date().toISOString();

function injectedFailure(op: string): DsResult<never> | null {
  try {
    const want = window.sessionStorage.getItem(FAIL_KEY);
    if (want && (want === op || want === '*')) {
      window.sessionStorage.removeItem(FAIL_KEY);
      return {
        ok: false,
        error: { kind: 'network', code: 'network', what: 'We couldn’t reach the server.', next: 'Check your connection and try again. Nothing was changed.' },
      };
    }
  } catch {
    /* sessionStorage blocked */
  }
  return null;
}

/** Read the current state, closing any auctions whose end time has passed (close on read). */
function current(): DemoState {
  const state = loadState();
  const r = processDueClosures(state, now());
  if (r.closed.length) saveState(r.state);
  return r.state;
}

function read<T>(op: string, fn: (s: DemoState) => T): Promise<DsResult<T>> {
  return delay().then(() => injectedFailure(op) ?? { ok: true, data: fn(current()) });
}

function write<T>(op: string, fn: (s: DemoState) => OpResult<T>): Promise<DsResult<T>> {
  return delay().then(() => {
    const failed = injectedFailure(op);
    if (failed) return failed;
    const before = current();
    const r = fn(before);
    // Some rejections still record something (a failed simulated EMD payment), so persist any change.
    if (r.state !== before) saveState(r.state);
    return r.ok ? { ok: true, data: r.value } : { ok: false, error: { ...r.error, kind: 'rule' } };
  });
}

export class DemoDataSource implements DataSource {
  readonly kind = 'demo' as const;

  listLots = (filters: Parameters<typeof listLots>[1]) => read('listLots', (s) => listLots(s, filters, now()));
  getLot = (id: string, viewer: Viewer) => read('getLot', (s) => lotDetail(s, id, viewer, now()));

  payEmd = (lotId: string, outcome: 'success' | 'failure', viewer: Viewer) =>
    write('payEmd', (s) => payEmd(s, { lotId, outcome }, { id: viewer.id ?? 'guest', role: viewer.role }, now()));

  placeBid = (input: Parameters<DataSource['placeBid']>[0], viewer: Viewer) =>
    write('placeBid', (s) => {
      const r = placeBid(s, input, { id: viewer.id ?? 'guest', role: viewer.role }, now());
      return r.ok ? { ...r, value: { amountPerMt: r.value.bid.amountPerMt, minNext: r.value.minNext } } : r;
    });

  closeDemoAuction = (lotId: string, viewer: Viewer) =>
    write('closeDemoAuction', (s) => closeDemoAuction(s, lotId, { id: viewer.id ?? 'guest', role: viewer.role }, now()));

  buyerDashboard = (viewer: Viewer) => read('buyerDashboard', (s) => (viewer.id ? buyerDashboard(s, viewer.id, now()) : null));
  transactionSummary = (id: string, viewer: Viewer) => read('transactionSummary', (s) => transactionSummary(s, id, viewer));

  registerBuyer = (input: Parameters<typeof registerBuyer>[1]) => write('registerBuyer', (s) => registerBuyer(s, input, now()));

  getUser = (id: string) =>
    read('getUser', (s) => {
      const user = s.users.find((u) => u.id === id);
      return user ? { user, company: s.companies.find((c) => c.id === user.companyId) ?? null } : null;
    });

  emailExists = (email: string) => read('emailExists', (s) => s.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()));

  notifications = (viewer: Viewer) =>
    read('notifications', (s) => s.notifications.filter((n) => n.userId === viewer.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)));

  markNotificationsRead = (viewer: Viewer) =>
    delay().then(() => {
      if (viewer.id) saveState(markNotificationsRead(current(), viewer.id));
      return { ok: true as const, data: null };
    });

  reset = () =>
    delay().then(() => {
      resetState();
      return { ok: true as const, data: null };
    });

  subscribe = subscribe;
}
