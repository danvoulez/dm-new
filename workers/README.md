# Permanent Hybrid Deploy — Cloudflare Edge + Supabase Postgres

Ledger is **append-only and authoritative** only in Postgres. UI + Workers run on Cloudflare. D1 never holds the ledger.

```
ui (Cloudflare Pages)  ──→  Workers api (Hono)  ──Hyperdrive──→  Supabase Postgres public.logline_acts
                                │  bindings: AI (Workers AI), OBJECTS (R2), PROJECTIONS (D1)
                                │  observability: enabled
                                └─────────────→ D1 dm-projections (rebuildable only)
```

## Why hybrid (not 100% D1)

`migrations/0003_rls_and_search_path.sql` puts `ENABLE ROW LEVEL SECURITY` with **no policies** on `public.logline_acts`. Only `service_role` (via Hyperdrive, bypasses RLS) can read/insert; `anon` gets nothing via PostgREST. Triggers block mutation even for `service_role`. D1 (SQLite) has no RLS and no service_role membrane — `docs/BENCH_VS_BOOTSTRAP.md` warns bench SQLite must never be prod. So: Postgres holds ledger, D1 holds only rebuildable `projection_docs`.

## One-time setup (solid, permanent)

1. **Supabase**
   ```bash
   # create project, then apply migrations in order (never rewrite 0001)
   supabase db push # or psql $DATABASE_URL < migrations/0001_logline_acts.sql
   psql $DATABASE_URL < migrations/0002_realtime_publication.sql
   psql $DATABASE_URL < migrations/0003_rls_and_search_path.sql
   psql $DATABASE_URL < migrations/0004_process_contracts.sql
   psql $DATABASE_URL < migrations/0005_runtime_queue.sql
   # verify
   psql $DATABASE_URL -c "select * from pg_tables where tablename='logline_acts';"
   psql $DATABASE_URL -c "select relname, relrowsecurity from pg_class where relname='logline_acts';" # t = RLS on
   ```
   Enable PITR + daily backups in Supabase dashboard. Keep `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (service_role) server-side only.

2. **Hyperdrive** (Workers ←→ Postgres over wire)
   ```bash
   npx wrangler hyperdrive create dm-lab-ledger --connection-string="postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   # copy id → workers/api/wrangler.jsonc hyperdrive[0].id
   npx wrangler hyperdrive get dm-lab-ledger
   ```

3. **D1 (projections only) + R2**
   ```bash
   npx wrangler d1 create dm-projections
   # copy database_id → wrangler.jsonc d1_databases[0].database_id
   npx wrangler d1 migrations apply dm-projections --local # then --remote
   npx wrangler r2 bucket create dm-objects
   ```

4. **Workers AI + AI Gateway (process_ingress)**
   - Models: `@cf/zai-org/glm-4.7-flash`, `llama-3.1`, `deepgram` stt/tts already in Workers AI catalog.
   - Create AI Gateway: `npx wrangler ai-gateway create dm-gateway` → set dollar spend limits (June 2026 feature) to cap runaway calls.

5. **Deploy**
   ```bash
   cd workers/api && npm install && npm run typecheck && npx wrangler deploy
   cd ../../ui && npm install && npm run build
   # Pages: connect github repo or `npx wrangler pages deploy dist/public`
   npx wrangler pages project create dm-lab-ui
   npx wrangler pages deploy ui/dist/public
   ```

6. **Secrets (never in git)**
   ```bash
   npx wrangler secret put SUPABASE_SECRET_KEY # service_role, used only in Worker
   npx wrangler secret put SUPABASE_URL
   # Doppler alternative: doppler run -- npx wrangler deploy
   ```

7. **Bootstrap genesis (once, explicit operator identity)**
   ```bash
   # Worker/Postgres path: set once before the token-protected /api/migrate call.
   printf '%s' 'dan@example.com' | npx wrangler secret put GENESIS_AUTHORITY
   # /api/migrate appends the genesis authority only when that identity is not already active.

   # Local Python/bench path remains:
   LAB_MODE=bootstrap LAB_DB="postgresql://..." python3 -m lab.cli bootstrap genesis
   # then lock to LAB_MODE=production everywhere
   ```

## Local drill (permanent parity)

```bash
# bench stays SQLite, never prod
LAB_MODE=bench LAB_DB=.lab/test.sqlite python3 -m lab.cli bootstrap local
LAB_MODE=bench python3 -m lab.cli bootstrap genesis --db .lab/test.sqlite
# UI against local bench API
LAB_DB=.lab/lab.sqlite python3 -m lab.cli api serve --port 8787 # (needs non-sandbox shell)
LAB_API_URL=http://127.0.0.1:8787 npm --prefix ui run dev
```

## Observability

`observability.enabled: true` in `wrangler.jsonc` → Workers logs + traces in Cloudflare dashboard. Add `wrangler tail` or Logpush to R2 for ledger audit.

## Backups

- Supabase PITR: 7-day (free) / 28-day (pro) — restore to any second.
- RLS + triggers guarantee ledger append-only even if Worker is compromised (service_role still can't UPDATE/DELETE).
- D1 projections: safe to drop and `workflows trigger rebuild` — they are derived, not source.

## What not to do

- Never replace `public.logline_acts` with D1 for authoritative writes.
- Never expose `SUPABASE_SECRET_KEY` to Pages/client.
- Never run `reset-bench` against any path outside `.lab/*.sqlite` or with `LAB_MODE != bench`.
