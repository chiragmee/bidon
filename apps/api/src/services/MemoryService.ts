import { createMemoryStore, LocalDataSource } from '@auctionit/client';

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
}
