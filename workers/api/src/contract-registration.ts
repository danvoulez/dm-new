import { appendAct } from "./db";
import type { PgClient } from "./db";
import type { Receipt } from "./receipt";

export type ContractSeed = {
  process_id: string;
  source_yml: string;
  contract: unknown;
};

/** Register the exact current law once, then point the mutable catalog row at that immutable Act. */
export async function ensureRegisteredContract(
  client: PgClient,
  seed: ContractSeed,
  authority: string,
  append: typeof appendAct = appendAct,
): Promise<string | null> {
  if (!authority.trim()) return null;
  const existing = await client.query<{ content_hash: string }>(
    `SELECT content_hash FROM public.logline_acts
     WHERE did='registered_process_contract' AND this=$1 AND act->'contract'=$2::jsonb
     ORDER BY inserted_at DESC LIMIT 1`,
    [seed.process_id, JSON.stringify(seed.contract)],
  );
  let contentHash = existing.rows[0]?.content_hash;
  if (!contentHash) {
    const receipt: Receipt = await append(client, {
      who: authority,
      did: "registered_process_contract",
      this: seed.process_id,
      when: new Date().toISOString(),
      confirmed_by: authority,
      if_ok: "registered.inert",
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "registered",
      contract: seed.contract,
      source_yml: seed.source_yml,
    });
    contentHash = receipt.id;
  }
  await client.query(
    "UPDATE public.process_contracts SET registered_hash=$1 WHERE process_id=$2 AND registered_hash IS DISTINCT FROM $1",
    [contentHash, seed.process_id],
  );
  return contentHash;
}
