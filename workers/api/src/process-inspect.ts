import type { PgClient } from "./db";
import type { CustodyQueueItem } from "./process-machine";

const HASH = /^[0-9a-f]{64}$/;

export type CurrentCustodyItem = CustodyQueueItem & {
  attempts: number;
  last_error: string | null;
  result_tuple: string | null;
};

const CURRENT_COLUMNS = `queue_id,process_instance,node,responsible,source_tuple,status,claimed_by,
  lease_until::text,created_at::text,updated_at::text,attempts,last_error,result_tuple`;

/** Read-only view of the current ephemeral work for one process instance. */
export async function currentCustody(client: PgClient, processInstance: string): Promise<CurrentCustodyItem | null> {
  if (!HASH.test(processInstance)) return null;
  const result = await client.query<CurrentCustodyItem>(
    `SELECT ${CURRENT_COLUMNS}
     FROM public.runtime_custody_queue
     WHERE process_instance=$1 AND status IN ('queued','claimed')
     ORDER BY updated_at DESC,created_at DESC,queue_id DESC LIMIT 1`,
    [processInstance],
  );
  return result.rows[0] ?? null;
}

/** Current-work projection. Historical closed custody is intentionally excluded. */
export async function currentCustodies(client: PgClient, limit = 100): Promise<CurrentCustodyItem[]> {
  const capped = Math.max(1, Math.min(500, Math.trunc(limit) || 100));
  const result = await client.query<CurrentCustodyItem>(
    `SELECT ${CURRENT_COLUMNS}
     FROM public.runtime_custody_queue
     WHERE status IN ('queued','claimed')
     ORDER BY updated_at DESC,created_at DESC,queue_id DESC LIMIT $1`,
    [capped],
  );
  return result.rows;
}
