import { createMemoryStore, LocalDataSource } from '@auctionit/client';
import { appointReviewer, type AppointInput, type User, type Viewer } from '@auctionit/domain';
import type { DsResult } from '@auctionit/client';
import type { StoredDocument } from './DbService';

/** DATA_MODE=demo: the API serves the same domain over an in-memory seed (no database). */
export class MemoryService extends LocalDataSource {
  private readonly mem: ReturnType<typeof createMemoryStore>;
  constructor() {
    const store = createMemoryStore();
    super(store);
    this.mem = store;
  }
  async verifySession(role: string, userId: string): Promise<boolean> {
    const u = this.mem.load().users.find((x) => x.id === userId);
    return !!u && u.role === role;
  }
  async profileForAuthUser(authUserId: string): Promise<{ id: string; role: 'buyer' | 'seller' | 'ops' } | null> {
    const u = this.mem.load().users.find((x) => x.authUserId === authUserId && x.staffLevel !== 'removed');
    return u ? { id: u.id, role: u.role } : null;
  }
  /** Same as the database service: `dryRun` checks the rules without saving, and the invited sign-in is linked. */
  override appointReviewer = async (
    input: Omit<AppointInput, 'authUserId'> & { authUserId?: string | null },
    viewer: Viewer,
    opts?: { dryRun?: boolean },
  ): Promise<DsResult<User>> => {
    const r = appointReviewer(this.mem.load(), { ...input, authUserId: input.authUserId ?? null }, { id: viewer.id ?? 'guest', role: viewer.role }, new Date().toISOString());
    if (!r.ok) return { ok: false, error: { ...r.error, kind: 'rule' } };
    if (!opts?.dryRun) this.mem.save(r.state);
    return { ok: true, data: r.value };
  };
  /** No Supabase in the in-memory demo: appointed reviewers have no sign-in to invite. */
  async authUserByEmail(): Promise<{ id: string; confirmed: boolean } | null> {
    return null;
  }
  addDocument(doc: StoredDocument, viewer: Viewer) {
    return this.recordDocument(doc, viewer);
  }
}
