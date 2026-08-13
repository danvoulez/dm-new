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
    `INSERT INTO public.logline_acts(content_hash, tuple_hash, receipt_version, act)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (content_hash) DO NOTHING`,
    [receipt.id, receipt.hashes.tuple_hash, receipt.receipt_version, canonicalJson(receipt)],
  );
  return receipt;
}

export async function getAct(client: PgClient, contentHash: string): Promise<Receipt | null> {
  const row = await client.query<{ act: Receipt }>("SELECT act FROM public.logline_acts WHERE content_hash=$1", [contentHash]);
  return row.rows[0]?.act ?? null;
}
