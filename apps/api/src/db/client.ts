import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/**
 * Direct Postgres connection (server only — DATABASE_URL never reaches the browser). Money is
 * stored as bigint and quantities as numeric; both come back as JS numbers.
 */
/** Supabase's transaction pooler (port 6543) can't keep prepared statements between transactions. */
export function usesTransactionPooler(url: string): boolean {
  return /:6543(\/|$|\?)/.test(url);
}

export function createSql(url: string, max = 10): Sql {
  return postgres(url, {
    max,
    prepare: !usesTransactionPooler(url),
    onnotice: () => {},
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}
