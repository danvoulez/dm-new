import { Client } from "pg";
import { canonicalJson, mintReceipt, type ActFields, type Receipt } from "./receipt";

export type PgEnv = { HYPERDRIVE: Hyperdrive };
export type PgClient = Client;

export function connectionString(env: PgEnv): string {
  return (env.HYPERDRIVE as unknown as { connectionString?: string })?.connectionString ?? "";
}

export async function withClient<T>(env: PgEnv, fn: (client: PgClient) => Promise<T>): Promise<T> {
  const conn = connectionString(env);
  if (!conn) throw new Error("hyperdrive binding unavailable");
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function appendAct(client: PgClient, fields: ActFields): Promise<Receipt> {
  const receipt = await mintReceipt(fields);
  await client.query(
    `INSERT INTO public.logline_acts(content_hash, tuple_hash, receipt_version, act, envelope_hash)
     VALUES ($1,$2,$3,$4::jsonb,$5)
     ON CONFLICT (tuple_hash) DO NOTHING`,
    [
      receipt.id,
      receipt.hashes.tuple_hash,
      receipt.receipt_version,
      canonicalJson(receipt),
      receipt.hashes.envelope_hash,
    ],
  );
  return receipt;
}

/** Semantic lookup by content identity. If several occurrences share content, return the
 * earliest deterministically. */
export async function getAct(client: PgClient, contentHash: string): Promise<Receipt | null> {
  const row = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE content_hash=$1 ORDER BY inserted_at,tuple_hash LIMIT 1",
    [contentHash],
  );
  return row.rows[0]?.act ?? null;
}

/** Exact contextual occurrence lookup. Parent/custody links in receipt v1 use this domain. */
export async function getTupleAct(client: PgClient, tupleHash: string): Promise<Receipt | null> {
  const row = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE tuple_hash=$1 LIMIT 1",
    [tupleHash],
  );
  return row.rows[0]?.act ?? null;
}
