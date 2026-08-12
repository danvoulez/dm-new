# Universal Inbox — Slice 1: Canyon (the Door) — design
_2026-06-25. Scope: the registrar endpoint only. The rest of the organism is context._
_Name: **Canyon** — the public mouth. Family: Golden Bridge (inference), Manhattan (maintenance), Canyon (ingress). Sign: `docs/CANYON.md`._

## The whole organism (context, not this slice)
```
HTTP qualquer → DOOR registra (limpo, calado)                         ← THIS SLICE
                     │
        ⟳ LLM premium agendado varre os registros (pull)              [slice 2]
        ┌────────────┼────────────────────┐
     acende       despacha voltando     deixa assentado (ghost)       [slice 2]
        │
   processo corre → PARA esperando um sujeito                         [slice 3]
        │
   Supabase Realtime → lab-bell → WAKE do sujeito (push)              [slice 3]
        │
   sujeito decide → admissão → consequência (conformance prende falsário)
```
Law: **tudo pode se registrar; só Acts admitidos criam consequência.** A Door só registra.

## What the Door is
A pure-registrar HTTP endpoint. It receives **any** POST, writes **one registration row**,
responds `202 registered`, and stops. It does **not** parse, judge, authenticate the content,
route, or wake anyone. A registration affirms nothing — it only remembers that bytes arrived.

This is why the Door is safe: a payload screaming `who/did/this = "claude sorriu pro Dan"`
is just bytes inside the registration. The Door makes no claim. Forging consequence is
impossible here — that only happens on the (gated) promotion path, which conformance guards.

## The registration row
Stored in the **live Supabase project** `bdhzrzqzjkqckylofeuy` (the same project as the
OAuth/passport work — one project for inbox + ledger + identity).

New table `inbox` (RLS on; **not** added to the realtime publication — registrations are silent):
```sql
create table public.inbox (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  source       text,                    -- http:<ip> + minimal meta, untrusted
  headers      jsonb,                   -- raw request headers
  body         text,                    -- raw payload, verbatim, unparsed
  content_hash text not null,           -- sha256 of the canonical {source,headers,body}
  status       text not null default 'registered'  -- never 'admitted'/'candidate' here
);
alter table public.inbox enable row level security;
-- no SELECT/INSERT policy for anon/authenticated; the Door inserts with the secret key
-- (service role bypasses RLS). Reads happen server-side only (the sweep, slice 2).
```
Fields mirror the LogLine framing: `who = door.inbox`, `did = registered`, `this = content_hash`
— expressed as the row above (a registration, not an Act asserting authority).

## The endpoint
- Language: **Python 3.13** (zero-dep stdlib `http.server`), in the `dream-machine-lab` repo
  as `lab/inbox/door.py` + `python -m lab.inbox.door`. Matches the kernel's zero-dep ethos.
- Behavior: accept `POST /api/*` (any path/body/content-type). Cap body size (e.g. 1 MiB).
  Compute `content_hash`. INSERT into `inbox` via Supabase REST (`/rest/v1/inbox`) using the
  **secret key from env** (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`). Return `202 {"status":"registered","id":...}`.
- Health: `GET /api/health` → `200 ok`.
- No auth on ingress (it's a public registrar). Abuse control = body-size cap + a simple
  per-IP rate limit; everything is inert anyway.

## Deploy (LAB_8GB)
- Run on **port 7010** (7000 is taken by macOS AirPlay/ControlCenter — leave it alone).
- Repoint the existing tunnel route: in `~/.cloudflared/config.yml`, change the
  `ingress.minilab.work` `/api/*` service from `http://127.0.0.1:7000` to `http://127.0.0.1:7010`;
  restart the tunnel. (Back up config.yml first — there are already dated backups.)
- Python via **uv** (`uv venv --python 3.13`) — present on the box; system python is 3.9.
- Secrets: `SUPABASE_SECRET_KEY` from env now; move to Doppler once re-set up. Never in code/git.
- Supervision: keep it alive under **Manhattan** (or a launchd plist) so it restarts on death.

## Out of scope (later slices)
LLM sweep / routing, processes lighting up, ghost/doubt closure, Realtime + lab-bell wake,
passport/visa enforcement, direct process-addressed requests. The Door stays dumb.

## Done = (acceptance)
1. `inbox` table exists in the live project with RLS, absent from the realtime publication.
2. `curl -X POST https://ingress.minilab.work/api/test -d 'hello dirty world'` returns `202`
   and creates one `inbox` row with the raw body and a `content_hash`.
3. The Door survives a kill (Manhattan/launchd restarts it).
4. A malformed/forged-Act-looking payload is registered harmlessly — no consequence, no error.

## Open decisions for review
- Table name `inbox` vs reusing `lab_log` with a `kind='registration'` flag. (Recommend `inbox`:
  keeps silent registrations physically separate from process-desiring Acts → trivial realtime filter.)
- Rate-limit policy (default: 60 req/min/IP, 1 MiB body).
