// Supabase Realtime listener for public.logline_acts.
//
// DOCTRINE (LAB FINAL IMPLEMENTATION SPEC v0 §3.4):
//   The row is the durable event. Realtime is the BELL. The Realtime payload is
//   NEVER the only copy of anything. The receiver always reads the ledger.
//
// This process is the transport/bell layer only. It does NOT select, queue, or
// execute. On each INSERT it wakes the receiver SELECTOR, whose job is to read
// canonical `if_ok` from the ledger and write queued transition receipts.
// (Selector = `lab.runtime.receiver_select` / `lab receiver <frequency>`.)
//
// Built on the canonical @supabase/supabase-js channel API (the real wheel):
//   https://supabase.com/docs/guides/realtime/postgres-changes
//
// AUTH: must use the SERVICE_ROLE key. public.logline_acts has RLS enabled with
// NO policies, so anon/publishable subscribers receive nothing. service_role
// bypasses RLS and therefore receives change events. Keep this process server-side.

import { createClient } from '@supabase/supabase-js'
import ws from 'ws' // Node < 22 has no native WebSocket; realtime-js needs a transport.

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing env. Required:\n' +
      '  SUPABASE_URL                (e.g. https://dtmhymciiwinnjhljozl.supabase.co)\n' +
      '  SUPABASE_SERVICE_ROLE_KEY   (service_role secret — NOT the publishable key;\n' +
      '                               RLS is on with no policies, so anon gets nothing)'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws }, // required on Node < 22 (no native WebSocket)
})

// The seam to the rest of the runtime. Realtime is the bell: we hand the selector
// the durable identity (content hash + frequency hints) and let IT read the ledger.
// This is intentionally NOT selection — wiring `lab receiver` here is the next step.
function wakeReceiverSelector(row) {
  const id = row?.content_hash ?? '(unknown content_hash)'
  const frequency = row?.if_ok ?? null // wake frequency lives in if_ok per wake-spec
  console.log(
    `[bell] INSERT ${id} who=${row?.who ?? '-'} did=${row?.did ?? '-'} ` +
      `this=${row?.this ?? '-'} if_ok=${frequency ?? '-'}`
  )
  // TODO(selector): trigger the receiver selector for `frequency`, which reads the
  // ledger (never this payload) and writes queued transition receipts. Until that
  // is wired, this listener only proves and logs the bell — it does not select.
}

const channel = supabase
  .channel('logline_acts_wake')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'logline_acts' },
    (payload) => wakeReceiverSelector(payload.new)
  )
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[realtime] subscribed to public.logline_acts INSERTs — listening.')
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[realtime] channel error:', err?.message ?? err)
    } else if (status === 'TIMED_OUT') {
      console.error('[realtime] subscription timed out; supabase-js will retry.')
    } else if (status === 'CLOSED') {
      console.warn('[realtime] channel closed.')
    }
  })

async function shutdown(signal) {
  console.log(`\n[realtime] ${signal} — removing channel and exiting.`)
  await supabase.removeChannel(channel)
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
