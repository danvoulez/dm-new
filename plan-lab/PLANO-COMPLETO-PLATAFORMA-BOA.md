# Plano Completo — Plataforma Boa DM Lab (Chat como Centro, Golden-Bridge Único, Sem Hardcode, Sem Pressa)

**Dono:** você. **Rito:** ler disco → propor 1 parágrafo → esperar seu `go` → fazer → `typecheck+build+test` + `curl` vivo → commit pequeno. Sem ansiedade.

## Visão (o que você mandou)
Plataforma boa, não aquilo torto. Centro = **registro em forma de processo via chat LLM** — sem formulário. Chat entende `intent` em prosa → `process_ingress.v1` (`process_id` do catálogo, `fields` só chaves declaradas, `missing`, `citations` 64hex) → usuário confirma → `POST /api/register` (append-only, RLS ON). **Cadastrar tipos e instanciar tipos existentes só pelo chat** (botão `+` para `POST /api/process-types`), sem `Novo` como rota primária. **Sem heurística**, LLM puro — falha é `502/503` claro. **Sem hardcode NADA**, sem chave Cloudflare/Vercel no Worker — **só golden-bridge** no lab 512 (junta Vercel/CF/local no cabo `10.88.0.10:1234` 512↔8GB) exposto via `https://llm.minilab.work` (`tunnel ef64804c-... → 127.0.0.1:8788`), `workers/api` é thin-proxy `fetch` para `llm.minilab.work/v1/*`, `GET /api/models` e `POST /api/chat/compile` vêm 100% da API do bridge. UI escolhe `provider/modelo` agrupado.

## Estado vivo lido agora
- `workers/api/src/index.ts` já só `GOLDEN_BRIDGE_URL`, zero `*_TOKEN`/`*_CATALOG`, `GET /api/models` e `POST /api/chat/compile` proxy puro (commit `5f854cd`).
- `ui/src/lib/dm-api.ts` `dmApi.models()` + `chatCompile(intent, model)` dinâmico; `ui/src/pages/Home.tsx` com seletor `local/CF/Vercel` e `Resumos.tsx` já com `useState` + `dmApi.advance`.
- `ui/src/components/ui` 55 arquivos mas só 9 usados (`button, card, dialog, input, label, separator, sheet, skeleton, textarea`), `toast` duplo, `not-found.tsx` morto, `Permissoes.tsx` já migrado para `dmApi`.
- `ui/index.html` já `DM Lab`, `plan-lab/PLANO-RITO…` e `PLANO-PLATAFORMA-BOA-EXECUTAVEL.md` no `main` (`c46d710`).

## Fazer funcionando (1 commit por item, sem pular)

**1. Prune UI (P1)** — manter só 9 `ui/components/ui` + `sonner.tsx`, apagar 43 + `not-found.tsx` + `hooks/use-toast.ts`/`toast.tsx`/`toaster.tsx`. Prova: `du -sh ui/src/components/ui` + `npm --prefix ui run build` (hoje 368kB → alvo <250kB).

**2. Dedup botões (P1)** — `PrimaryButton` único em `ui/src/components/ui/button.tsx` e trocar `rounded-full bg-foreground` em 7 pages. Prova: `grep -r "rounded-full bg-foreground" ui/src` → 0 fora de `button.tsx`.

**3. AppLayout + Vite (P1)** — `vite.config.ts` `allowedHosts: true`, unificar `VITE_API_URL` + `LAB_API_URL=https://api.carbonlab.work` para espelhar prod. Prova: `LAB_API_URL=https://api.carbonlab.work npm --prefix ui run dev` sem tocar prod.

**4. Túnel + Bridge vivo (P0)** — corrigir DNS `llm.min.minilab.work` → `llm.minilab.work` (`cloudflared tunnel route dns -f ef64804c... llm.minilab.work`), subir `python3 /tmp/golden-bridge-server.py`, `curl` local `8788` e `curl https://llm.minilab.work/v1/models`.

**5. Deploy + prova viva (P0)** — `npx wrangler deploy --config workers/api/wrangler.jsonc` + `curl -s https://api.carbonlab.work/api/health`, `curl -s https://api.carbonlab.work/api/models | jq`, `curl -s https://api.carbonlab.work/api/chat/compile -d '{"intent":"criar processo de compra com valor e fornecedor","model":"mistral-nemo-12b"}' | jq .suggestion`.

Cada 1→5 = `typecheck+build+test` + `curl` + commit `ui: plataforma boa — <item>`.
