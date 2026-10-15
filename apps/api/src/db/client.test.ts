import { expect, it } from 'vitest';
import { usesTransactionPooler } from './client';

it('turns prepared statements off only for the transaction pooler', () => {
  expect(usesTransactionPooler('postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres')).toBe(true);
  expect(usesTransactionPooler('postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:5432/postgres')).toBe(false);
  expect(usesTransactionPooler('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe(false);
});
