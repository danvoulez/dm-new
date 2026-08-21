import type { PgClient } from "./db";
import type { CustodyQueueItem } from "./process-machine";

const HASH = /^[0-9a-f]{64}$/;

/** Read-only view of who currently holds a process instance. */
export async function currentCustody(client: PgClient, processInstance: string): Promise<CustodyQueueItem | null> {
  if (!HASH.test(processInstance)) return null;
  const result = await client.query<CustodyQueueItem>(
    `SELECT queue_id,process_instance,node,responsible,source_tuple,status,claimed_by,
       lease_until::text,created_at::text,updated_at::text
     FROM public.runtime_custody_queue
     WHERE process_instance=$1 AND status='queued'
     ORDER BY created_at,queue_id LIMIT 1`,
    [processInstance],
  );
  return result.rows[0] ?? null;
}
