# DM Lab — UI

Adaptado de `old_carbon-labo/ui` para o ledger `dm-new`. Tudo registra, só avança o que está completo. Vocab sem burocratês: `ID` (8 chars), `Recibo`, `Pendente`, `Modelo`, `Permissão`, `Resumo`, `Sugestão`.

## Requisitos

- Node 22+, npm 10+ (ou pnpm 9)
- Python 3.11+ para `lab/api.py` (ledger)

## Rodar

Terminal 1 — API (ledger):

```bash
cd /Users/ubl-ops/dm-new
python3 -m lab.api  # serve em http://127.0.0.1:8787
# ou: LAB_DB=.lab/lab.sqlite python3 -c "from lab.api import serve; serve(port=8787)"
```

Terminal 2 — UI (proxy `/api` → `lab/api`):

```bash
cd /Users/ubl-ops/dm-new/ui
npm install
npm run dev  # http://127.0.0.1:4173
# com API em outra porta/host:
LAB_API_URL=http://127.0.0.1:8787 npm run dev
```

Rotas: `/` Conversar · `/agora` Agora · `/pendentes` Pendentes · `/casos/:hash` Caso · `/novo` Novo registro · `/sugestoes` Sugestões · `/resumos` Resumos · `/permissoes` Permissões

## Verificação

```bash
npm run typecheck
npm run build   # dist/public
```

API smoke (sem UI):

```bash
curl -s http://127.0.0.1:8787/api/health | jq
curl -s http://127.0.0.1:8787/api/process-types | jq '.types[] | {process_id,title,runnable,danger_tier}'
curl -s http://127.0.0.1:8787/api/vocabulary | jq '.count'
```

## Notas

- `lab/api.py` é `http.server` reference — só para dev local. Por trás use servidor real.
- Correção é novo registro que cita o anterior (ledger append-only). Nada é reescrito.
- L5 (ex: `notification.v1`) exige segurar + digitar nome + chave — atrito deliberado.
