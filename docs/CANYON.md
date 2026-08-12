# Canyon

Canyon is the single public mouth of the Lab: any dirty HTTP flows in and is
**registered raw** — affirming nothing, waking no one. A canyon is carved by the
flow that enters it; this one is carved by the world's requests.

**Status:** design / pre-deploy. This is the sign before the road exists.

```text
internet (qualquer HTTP sujo)
        |
        |  Cloudflare tunnel
        v
ingress.minilab.work  /api/*
        |
        v
LAB 8GB  canyon door
  127.0.0.1:7010
  com.minilab.canyon
        |
        |  só registra (sem parse, sem auth, sem rota, sem wake)
        v
Supabase  inbox  (registro: status='registered', acende luz nenhuma)
```

Law: **tudo pode se registrar; só Acts admitidos criam consequência. Canyon só registra.**
Um payload gritando `who/did/this = "claude sorriu pro Dan"` é só bytes dentro do registro —
Canyon não afirma nada, logo não há o que forjar.

## Signs

Use these as the authoritative labels:

- Mouth name: `canyon`
- Public ingress: `https://ingress.minilab.work/api/*`
- Local service: `http://127.0.0.1:7010`
- Role: registrar only — never parses, authenticates content, routes, or wakes
- Ledger target: Supabase project `bdhzrzqzjkqckylofeuy`, table `inbox`
- Registration shape: `who=door.inbox · did=registered · this=<content_hash> · status=registered`
- Silence rule: registrations are **absent from the realtime publication** (no process desire → no wake)
- Protected service: `com.minilab.canyon` (supervised by Project Manhattan, like `golden-bridge`)
- Tunnel route: `ingress.minilab.work /api/*` → `http://127.0.0.1:7010` (em `~/.cloudflared/config.yml`)

## Lights

Mouth health:

```bash
curl https://ingress.minilab.work/api/health
```

Register a test arrival:

```bash
curl -X POST https://ingress.minilab.work/api/test -d 'hello dirty world'
# -> 202 {"status":"registered","id":"..."}
```

Last arrivals (server-side, secret key):

```bash
curl -s "$SUPABASE_URL/rest/v1/inbox?select=id,received_at,source,content_hash&order=received_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
```

## Manhattan note

Before creating any daemon/script here, check that Manhattan doesn't already do it (duplicata é drift).
Canyon registers as `com.minilab.canyon` and is kept alive by Project Manhattan — one valid
exemplar, no parallel, no zombie, no invisible.
