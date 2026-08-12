# Plano — Rito de Trabalho com Respeito (Golden-Bridge)

**Dono:** você. **Eu:** ferramenta que lê disco, propõe, só mexe com seu `go` e só fala que funcionou depois de `curl` ao vivo.

## Rito (5 passos, sempre)

1. **Ler disco antes de falar** — `fleet/machines/lab-512.yml`, `golden-bridge-topologia.md`, `workers/api/src/index.ts`, `ui/src/pages/Home.tsx`, `tools/golden_bridge.py`. Sem inventar.
2. **Propor em 1 parágrafo** — o que muda, onde, efeito. Sem código ainda.
3. **Esperar seu `go`** — sem `wrangler deploy`, sem `git push` sem `go`.
4. **Fazer + testar na sua frente** — `pytest`, `typecheck`, `vite build`, `curl https://api.carbonlab.work/api/models` e `curl https://llm.minilab.work/v1/chat/compile` com saída na tela.
5. **Registrar** — commit pequeno com mensagem que diz o que foi testado.

## O que você já mandou (centro)

- Centro = **registro em forma de processo via chat LLM**, sem formulário. Chat entende `intent` → `process_ingress.v1` (`process_id` do catálogo, `fields` só chaves declaradas, `missing`, `citations` 64hex) → usuário confirma → `POST /api/register`.
- **Cadastrar tipos e instanciar tipos existentes só pelo chat** — botão `+` no `Conversar` para `POST /api/process-types` e compilação para instância.
- **Sem heurística**, LLM puro. Se falhar, `502/503` claro, não fallback silencioso.
- **Sem hardcode NADA**, sem chave Cloudflare/Vercel no Worker. **Só golden-bridge** (`lab 512` junta Vercel/CF/local), `workers/api` é thin-proxy `fetch https://llm.minilab.work/v1/*`, `GET /api/models` e `POST /api/chat/compile` vêm 100% da API do bridge. UI escolhe `provider/modelo` via `GET /api/models` do bridge (agrupado `local | cloudflare | vercel`).
- **Túnel** `ef64804c-...` `llm.minilab.work → 127.0.0.1:8788` (`~/.cloudflared/build-256.yml`), servidor `/tmp/golden-bridge-server.py` (ou `tools/golden_bridge.py`).
- **Comutadores em `192.168.0.0/24` via wifi**, `10.88.0.10:1234` só via cabo direto 512↔8GB — por isso o bridge precisa estar no 512 e exposto via túnel, não via `LOCAL_LLM_URL` direto do Worker.

## Plataforma boa — não aquilo torto e repetitivo

**Diagnóstico vivo:** `ui/src/components/ui` 55 arquivos (308K) mas só 9 imports reais (`button`, `card`, `dialog`, `input`, `label`, `separator`, `sheet`, `skeleton`, `textarea`, `toast`); resto morto infla `vite build` 368kB. `toast` duplo, `not-found.tsx` morto, `Resumos.tsx` sem `useState`, `Permissoes`/`Resumos` com `fetch` cru, `index.html` `Meu Workspace`, `AppLayout` 292px torto em mobile, botões copiados 12×, `Home` sem agrupamento de modelos.

**Plataforma boa = 4 leis:**
1. **Uma linguagem** — 8 componentes `ui` só, `PrimaryButton` único, `sonner` único, sem `toast` duplicado.
2. **Um centro** — `Conversar` com seletor agrupado `local/CF/Vercel` (já) + `model` respeitado no `POST /api/chat/compile`, sem `Novo` como rota primária.
3. **Sem repetição** — `dmApi` único para todos `fetch`, `AppLayout` limpo com `Sidebar` + `MobileNav` sem `card` torto.
4. **Prova viva** — cada commit `typecheck+build+test` + `curl` no bridge.

**Fazer funcionando (1 commit por item):**
1. `Resumos.tsx` + `useState`, `index.html` → `DM Lab`.
2. `dmApi` — `advance/grants/signoff/revoke` e trocar `fetch` cru.
3. **Prune** — apagar `toast.tsx`/`toaster.tsx`/`use-toast.ts` + 40 `ui/*.tsx` não usados (manter 9), `vite build` antes 368kB → depois <250kB.
4. **Dedup** — `PrimaryButton` em `ui/src/components/ui/button.tsx` e trocar em 8 pages.
5. `AppLayout` — remover `not-found.tsx`, `vite.config.ts` `allowedHosts` + `VITE_API_URL` unificado.
6. Teste vivo final: `pytest 348 + typecheck + build + curl api/health + curl llm/v1/models`.

## Próximos `go` (um por vez, com `curl` na frente)

1. `go corrigir DNS` — `cloudflared tunnel route dns -f ef64804c... llm.minilab.work` (corrige `llm.min.minilab.work`).
2. `go subir bridge` — `python3 /tmp/golden-bridge-server.py` + `curl` local `8788`.
3. `go UI torta` — executa 1→7 acima com `vite build` antes/depois visível.
4. `go deploy` — `wrangler deploy` + `curl` vivo `api.carbonlab.work/api/models` do bridge.
