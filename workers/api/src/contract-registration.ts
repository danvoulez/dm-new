import { appendAct } from "./db";
import type { PgClient } from "./db";
import type { Receipt } from "./receipt";

export type ContractSeed = {
  process_id: string;
  source_yml: string;
  contract: unknown;
};

/**
 * Import one YAML/bootstrap contract into the canonical ledger language.
 *
 * `process_contracts` remains a compatibility cache for legacy runtime paths only.
 * The immutable `defined_process_type` Act is authoritative; the table merely remembers
 * which ledger hash corresponds to the imported seed while Phase 2 migration completes.
 */
export async function ensureRegisteredContract(
  client: PgClient,
  seed: ContractSeed,
  authority: string,
  append: typeof appendAct = appendAct,
): Promise<string | null> {
  if (!authority.trim()) return null;
  const definition = seed.contract;
  const existing = await client.query<{ content_hash: string }>(
    `SELECT content_hash FROM public.logline_acts
     WHERE did='defined_process_type' AND this=$1 AND act->'definition'=$2::jsonb
     ORDER BY inserted_at,tuple_hash LIMIT 1`,
    [seed.process_id, JSON.stringify(definition)],
  );
  let contentHash = existing.rows[0]?.content_hash;
  if (!contentHash) {
    const receipt: Receipt = await append(client, {
      who: authority,
      did: "defined_process_type",
      this: seed.process_id,
      when: new Date().toISOString(),
      confirmed_by: authority,
      if_ok: "defined",
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "active",
      definition,
      source_yml: seed.source_yml,
      envelope: {},
    });
    contentHash = receipt.id;
  }
  await client.query(
    "UPDATE public.process_contracts SET registered_hash=$1 WHERE process_id=$2 AND registered_hash IS DISTINCT FROM $1",
    [contentHash, seed.process_id],
  );
  return contentHash;
}
