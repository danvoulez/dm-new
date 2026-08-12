# Design QA — DM Lab UI (adaptado)

Base: `old_carbon-labo/ui` (Meu Workspace) → adaptado para `dm-new` ledger. Mantido shell responsivo (sidebar 292px desktop, drawer mobile, safe-area, compositor 28px radius), trocado vocabulário institucional por plataforma: `ID` (8 chars), `Recibo`, `Pendente`, `Modelo`, `Permissão`, `Resumo`, `Sugestão`.

## Rotas verificadas (build + jsdom)

- `/` Conversar — compositor `O que vamos registrar?` + `POST /api/register` (who/did/this + who)
- `/agora` Agora — `needs_you / moving / closed_today` de `GET /api/now`, empty `Nada pendente com você`
- `/pendentes` Pendentes — `GET /api/pendencies`, filtro Você/Operador/Todos, card frase + botão + `Falta: ...`, sheet de correção (novo registro com `citations`)
- `/casos/:hash` Caso — `GET /api/cases/:hash` timeline, slots, fingerprint
- `/novo` Novo — `GET /api/process-types` contract-driven (requires/accepts), runnable vs indisponível, prova exigida, perigo L4/L5
- `/sugestoes` Sugestões — `GET /api/candidates`
- `/resumos` Resumos — `GET /api/projections`, nota `Resumos reconstruíveis. Não são a fonte.`
- `/permissoes` Permissões — `GET /api/grants`, criar com 4 campos obrigatórios (valid_until, timeout, fs_scope, network_policy), assinar/revogar, L5 hold-to-confirm + digitar nome

## Verificação

```bash
npm run typecheck # tsc --noEmit OK
npm run build     # vite 7.3.x, 1876 modules, 353.99kB (108.9kB gzip) OK
npm test          # vitest jsdom, 2 files / 3 tests OK
```

Proxy `/api` → `LAB_API_URL` (default `http://127.0.0.1:8787` `lab/api.py`). Sem API, telas mostram `Falha ao carregar` — não tela branca.

## Pendências visuais restantes

- Fotos de evidência antigas (`design-evidence/*.png`) são do Meu Workspace — refazer para novas rotas quando houver sessão real (`lab/api` + auth).
