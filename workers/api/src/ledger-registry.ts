import type { ProcessContract } from "./contracts";
import { appendAct, type PgClient } from "./db";
import { SLOTS, type Receipt } from "./receipt";

const HASH = /^[0-9a-f]{64}$/;

export type VocabularyTerm = {
  domain: string;
  term: string;
  meaning: string;
  outcome: string | null;
  definition_hash: string;
  tuple_hash: string;
  status: string;
  definition: Record<string, unknown>;
};

export const BOOTSTRAP_VOCABULARY = [
  {
    domain: "did",
    term: "defined_vocabulary_term",
    meaning: "defines or versions one governed vocabulary term in the ledger",
  },
  {
    domain: "did",
    term: "defined_process_type",
    meaning: "defines one immutable process type version in the ledger",
  },
  {
    domain: "did",
    term: "opened_process",
    meaning: "opens one process instance whose content hash becomes instance identity",
  },
] as const;

/** Idempotent operational migration for ledger-native registry projections. */
export async function migrateLedgerRegistry(client: PgClient): Promise<void> {
  await client.query(`
    create or replace view public.current_process_types as
    with definitions as (
      select
        content_hash as registered_hash,
        tuple_hash,
        act->>'this' as process_id,
        act->>'who' as defined_by,
        act->>'when' as defined_when,
        act->>'status' as status,
        act->'definition' as definition,
        act->>'supersedes' as supersedes,
        act->>'source_yml' as source_yml,
        inserted_at
      from public.logline_acts
      where did = 'defined_process_type'
        and coalesce(act->>'this','') <> ''
        and jsonb_typeof(act->'definition') = 'object'
    ), unsuperseded as (
      select d.*
      from definitions d
      where not exists (
        select 1 from definitions newer
        where newer.supersedes = d.registered_hash
      )
    ), ranked as (
      select *, row_number() over (
        partition by process_id
        order by inserted_at desc, tuple_hash desc
      ) as rn
      from unsuperseded
    )
    select
      process_id, registered_hash, tuple_hash, definition, supersedes,
      status, defined_by, defined_when, source_yml, inserted_at
    from ranked
    where rn = 1;

    create or replace view public.current_vocabulary as
    with ranked as (
      select
        content_hash as definition_hash,
        tuple_hash,
        act->'definition'->>'domain' as domain,
        act->'definition'->>'term' as term,
        act->'definition'->>'meaning' as meaning,
        act->'definition'->>'outcome' as outcome,
        act->>'who' as defined_by,
        act->>'when' as defined_when,
        act->>'status' as status,
        act->'definition' as definition,
        inserted_at,
        row_number() over (
          partition by act->'definition'->>'domain', act->'definition'->>'term'
          order by inserted_at desc, tuple_hash desc
        ) as rn
      from public.logline_acts
      where did = 'defined_vocabulary_term'
        and jsonb_typeof(act->'definition') = 'object'
        and coalesce(act->'definition'->>'domain','') <> ''
        and coalesce(act->'definition'->>'term','') <> ''
    )
    select
      domain, term, meaning, outcome, definition_hash, tuple_hash,
      definition, status, defined_by, defined_when, inserted_at
    from ranked
    where rn = 1;
  `);
}

/** Pure projection read. Empty means no ledger-native type has been seeded yet. */
export async function loadLedgerProcessTypes(client: PgClient): Promise<Map<string, ProcessContract>> {
  const result = await client.query<{
    process_id: string;
    registered_hash: string;
    definition?: ProcessContract;
    contract?: ProcessContract;
    status: string;
    title?: string;
  }>(
    `SELECT process_id,registered_hash,definition,status
     FROM public.current_process_types
     ORDER BY process_id`,
  );
  const entries: Array<[string, ProcessContract]> = [];
  for (const row of result.rows) {
    // `contract`/`title` support legacy test doubles only; real projection rows use definition.
    const definition = row.definition ?? row.contract;
    if (!definition || typeof definition !== "object") continue;
    entries.push([row.process_id, {
      ...definition,
      process_id: row.process_id,
      title: row.title || definition.title,
      status: row.status || definition.status || "active",
      registered_hash: row.registered_hash ?? definition.registered_hash ?? null,
    }]);
  }
  return new Map(entries);
}

export async function listCurrentVocabulary(client: PgClient): Promise<VocabularyTerm[]> {
  const result = await client.query<VocabularyTerm>(
    `SELECT domain,term,meaning,outcome,definition_hash,tuple_hash,status,definition
     FROM public.current_vocabulary
     ORDER BY domain,term`,
  );
  return result.rows.map((row) => ({
    ...row,
    meaning: row.meaning ?? "",
    outcome: row.outcome ?? null,
    definition: row.definition ?? {},
  }));
}

/** Seed only the three bootstrap verbs required to let vocabulary govern itself. */
export async function ensureBootstrapVocabulary(
  client: PgClient,
  authority: string,
  append: typeof appendAct = appendAct,
): Promise<string[]> {
  if (!authority.trim()) return [];
  const hashes: string[] = [];
  for (const definition of BOOTSTRAP_VOCABULARY) {
    const existing = await client.query<{ content_hash: string }>(
      `SELECT content_hash FROM public.logline_acts
       WHERE did='defined_vocabulary_term'
         AND act->'definition'=$1::jsonb
       ORDER BY inserted_at,tuple_hash LIMIT 1`,
      [JSON.stringify(definition)],
    );
    if (existing.rows[0]?.content_hash) {
      hashes.push(existing.rows[0].content_hash);
      continue;
    }
    const receipt: Receipt = await append(client, {
      who: authority,
      did: "defined_vocabulary_term",
      this: `${definition.domain}:${definition.term}`,
      when: new Date().toISOString(),
      confirmed_by: authority,
      if_ok: "defined",
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "active",
      definition,
      envelope: {},
    });
    hashes.push(receipt.id);
  }
  return hashes;
}

export async function aboutSystem(client: PgClient) {
  const [processes, vocabulary] = await Promise.all([
    loadLedgerProcessTypes(client),
    listCurrentVocabulary(client),
  ]);
  return {
    system: "LogLine process machine",
    grammar: {
      slots: [...SLOTS],
      aux: "free JSON authored with the Act",
      envelope: "explicit contextual JSON, separate from semantic content identity",
      identity: {
        content_hash: "H(JCS(LogLine 9 + AUX))",
        envelope_hash: "H(JCS(envelope))",
        tuple_hash: "H(content_hash + envelope_hash)",
      },
    },
    tools: ["about", "search", "append"],
    bootstrap_verbs: BOOTSTRAP_VOCABULARY.map((item) => item.term),
    process_types: Array.from(processes.values()).map((process) => ({
      process_id: process.process_id,
      title: process.title ?? process.process_id,
      status: process.status ?? "active",
      registered_hash: process.registered_hash ?? null,
    })),
    vocabulary,
  };
}

export async function searchLedger(client: PgClient, query: string, limit = 20) {
  const text = query.trim();
  const capped = Math.max(1, Math.min(50, Math.trunc(limit) || 20));
  if (!text) {
    const [processes, vocabulary] = await Promise.all([
      loadLedgerProcessTypes(client),
      listCurrentVocabulary(client),
    ]);
    return {
      query: text,
      acts: [],
      process_types: Array.from(processes.values()).slice(0, capped),
      vocabulary: vocabulary.slice(0, capped),
    };
  }
  const pattern = `%${text}%`;
  const [acts, processTypes, vocabulary] = await Promise.all([
    client.query<{
      content_hash: string;
      tuple_hash: string;
      who: string;
      did: string;
      this: string;
      status: string;
      act: Record<string, unknown>;
    }>(
      `SELECT content_hash,tuple_hash,who,did,this,status,act
       FROM public.logline_acts
       WHERE who ILIKE $1 OR did ILIKE $1 OR this ILIKE $1 OR status ILIKE $1 OR act::text ILIKE $1
       ORDER BY inserted_at DESC,tuple_hash DESC
       LIMIT $2`,
      [pattern, capped],
    ),
    client.query<{
      process_id: string;
      registered_hash: string;
      status: string;
      definition: Record<string, unknown>;
    }>(
      `SELECT process_id,registered_hash,status,definition
       FROM public.current_process_types
       WHERE process_id ILIKE $1 OR definition::text ILIKE $1
       ORDER BY process_id
       LIMIT $2`,
      [pattern, capped],
    ),
    client.query<VocabularyTerm>(
      `SELECT domain,term,meaning,outcome,definition_hash,tuple_hash,status,definition
       FROM public.current_vocabulary
       WHERE domain ILIKE $1 OR term ILIKE $1 OR meaning ILIKE $1 OR definition::text ILIKE $1
       ORDER BY domain,term
       LIMIT $2`,
      [pattern, capped],
    ),
  ]);
  return {
    query: text,
    acts: acts.rows,
    process_types: processTypes.rows,
    vocabulary: vocabulary.rows,
  };
}

export function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
