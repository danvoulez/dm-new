# Dream ingress operations

## Ownership boundaries

Dream owns the human conversation, its single short system prompt, tool definitions, process-contract lookup, LogLine composition, registration and activation evaluation. Golden Bridge owns only live catalog publication and exact transport to Local, Vercel AI Gateway or Cloudflare AI Gateway.

The normal conversation is not translated into LogLine. Formalization happens only when the person asks to register or requests a governed consequence. A governed consequence must read and cite the registered process contract first; each process may reinterpret all nine tuple fields.

## Request path

```text
composer model picker + human message
  -> POST /api/chat/turn with explicit canonical model
  -> Worker validates current Golden Bridge catalog and dream-agent.v1 certificate
  -> Dream sends its system/messages/tools unchanged through Golden Bridge
  -> selected model may consult process contracts and formalize one or more Acts
  -> append Act first
  -> evaluator classifies inert/incompleto/incompatible/doubted/ativável
  -> only an activatable Act enters runtime_queue
```

No layer selects a default model. A failed selected model returns an honest error and asks the person to choose another Golden Bridge option.

## Public checks

```bash
curl -fsS https://api.carbonlab.work/api/models | jq '{provider,sources,data:[.data[]|{id,source,selectable}]}'
curl -fsS https://api.carbonlab.work/api/health | jq .
```

In `https://app.carbonlab.work`, verify:

1. the selector is inside the composer and has no `Automático` option;
2. Local, Vercel and Cloudflare source states are visible even when unavailable;
3. sending is disabled until a selectable model is chosen;
4. normal conversation creates no Act;
5. a pure record shows `Registrado · <fingerprint>` and `Apenas registrado` separately;
6. a governed request consults/cites the contract and reports `Andando` or `Esperando` independently from custody;
7. a model failure names the selected model/error and requires a human choice.

## Required secret names

GitHub repository:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_DB_URL`
- `MIGRATE_TOKEN`

Cloudflare Worker:

- `MIGRATE_TOKEN` — exactly the same independently generated value as the GitHub repository secret;
- Golden Bridge Access/tunnel secrets already declared by the Worker configuration.

`MIGRATE_TOKEN` is not a Supabase API key. The deploy workflow does not reuse a database URL or `SUPABASE_SECRET_KEY` as an application migration token.

## Compromised Supabase secret key

An `sb_secret_...` value disclosed in chat must be treated as compromised and must never be copied from the transcript into a command. In Supabase Dashboard → Settings → API Keys:

1. create a new secret key named for its one backend consumer;
2. update that consumer using its native secret store;
3. prove the consumer with a bounded read;
4. inspect all consumers, jobs and webhooks;
5. delete the disclosed key only after the replacement is proven.

Deletion is irreversible. Record key names and timestamps only, never values.

## Deployment order

1. Golden Bridge candidate on LAB 8GB port 8788.
2. Run `scripts/acceptance/model-routing.mjs` through an SSH port forward.
3. Activate Golden Bridge on 8787; prove rollback once; reactivate candidate.
4. Push Dream branch and open PR to `main`.
5. Observe the complete CI gate.
6. Merge; observe migrate → API → UI.
7. Run the public checks above. A green workflow alone is not product acceptance.
