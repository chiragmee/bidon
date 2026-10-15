// The DataSource contract and both implementations live in packages/client (shared with the API's
// contract tests). Re-exported here so web code keeps importing from '@/data'.
export * from '@auctionit/client';
export const ROLE_LABEL = { guest: 'Guest', buyer: 'Buyer', seller: 'Seller', ops: 'Operations' } as const;
