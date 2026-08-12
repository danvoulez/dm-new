# Plano Executável — Plataforma Boa (não aquilo torto)

**Dono:** você. **Princípio:** cada item só fecha com `typecheck+build+test` + `curl` vivo. Sem papel.

## 0. Estado vivo quebrado (lido agora do disco)
- `ui/src/components/ui` 55 arquivos (308K) mas só 9 imports reais (`button`×4, `card`, `dialog`, `input`×2, `label`×2, `separator`×4, `sheet`×3, `skeleton`, `textarea`, `toast`/`tooltip`). Resto morto.
- `toast` duplo: `toast.tsx` (126 linhas) + `hooks/use-toast.ts` + `toaster.tsx` vs `sonner.tsx` (31 linhas) — nenhum usado em `src`.
- `ui/src/pages/not-found.tsx` morto (404 inline já em `App.tsx:31` com `Página não encontrada.`).
- `ui/src/pages/Resumos.tsx:1` sem `useState` (hook em `const [msg]` linha 8 mas import só `useQuery`), e `fetch` cru com `VITE_API_URL` em vez de `dmApi.advance`.
- `ui/src/pages/Permissoes.tsx` 3× `fetch` cru (`/api/grants`, `/signoff`, `/revoke`) fora de `dmApi`.
- `ui/index.html:7` `Meu Workspace` (título/OG/twitter) vs marca `DM Lab` no `Sidebar`.
- `ui/vite.config.ts:25` `allowedHosts: ['terminal.local','localhost','127.0.0.1']` — quebra `app.carbonlab.work` em dev túnel.
- Botões `rounded-full bg-foreground` repetidos 12× em 7 pages — sem `PrimaryButton` único.
- `Home.tsx` já tem seletor agrupado `local/CF/Vercel` mas sem dedup visual.

## 1. Fazer funcionando (ordem, 1 commit por item)

**1.1 Resumos + HTML (P0, 10min)**
- `ui/src/pages/Resumos.tsx:1` → `import { useState } from "react"` no topo, apagar `import` solto no fim, trocar `fetch(.../api/advance...)` → `dmApi.advance({worker:"ui-rebuild"})`.
- `ui/index.html:7-15` → `Meu Workspace` → `DM Lab`, `description` → `Plataforma de processos com chat LLM`, `og:title`/`twitter:title` idem.
- Teste: `npm --prefix ui run typecheck && npm --prefix ui run build` (tem que passar, antes quebrava).

**1.2 dmApi único (P0, 20min)**
- `ui/src/lib/dm-api.ts` + `advance()`/`grants()` já feito → + `createGrant`/`signoff`/`revoke`/`grant` e trocar `Permissoes.tsx:25,40,55` `fetch` cru → `dmApi.*`.
- Teste: `grep -r "fetch.*\/api" ui/src --include="*.tsx" | wc -l` tem que ser 0 depois.

**1.3 Prune (P1, 30min, mede bundle)**
- Manter só 9 `ui/components/ui`: `button.tsx, card.tsx, dialog.tsx, input.tsx, label.tsx, separator.tsx, sheet.tsx, skeleton.tsx, textarea.tsx` (+ `sonner.tsx` se for o escolhido, apagar `toast.tsx`/`toaster.tsx`/`use-toast.ts`).
- Apagar outros 43 e `not-found.tsx`.
- Antes/depois: `du -sh ui/src/components/ui` e `npm --prefix ui run build` (hoje 368kB gzip 112kB → alvo <250kB).

**1.4 Dedup botões (P1, 20min)**
- `ui/src/components/ui/button.tsx` já tem `buttonVariants` — extrair `PrimaryButton` (`rounded-full bg-foreground text-background`) e `GhostButton` (`rounded-full border`) e trocar nas 7 pages (grep `rounded-full bg-foreground`).
- Teste: `grep -r "rounded-full bg-foreground" ui/src --include="*.tsx" | wc -l` → 0 fora de `button.tsx`.

**1.5 AppLayout + Vite (P1, 15min)**
- `ui/src/components/layout/AppLayout.tsx` — remover import `not-found`, `vite.config.ts` → `allowedHosts: true` + `LAB_API_URL=https://api.carbonlab.work` unificado com `VITE_API_URL`.
- Teste: `LAB_API_URL=https://api.carbonlab.work npm --prefix ui run dev -- --host 0.0.0.0` espelha prod sem tocar prod.

**1.6 Prova viva final (P0, 10min)**
- `pytest -q` (348), `npm --prefix ui run typecheck && npm --prefix ui run build && npm --prefix ui test`, `curl -s https://api.carbonlab.work/api/health`, `curl -s https://api.carbonlab.work/api/models | jq .data[0]`, `curl -s https://llm.minilab.work/v1/chat/compile -d '{"intent":"teste"}' | jq .suggestion`.

## 2. Entrega
Cada 1.1→1.6 é 1 commit + 1 push `main` com mensagem `ui: plataforma boa — <item> — typecheck/build/test + curl vivo`.

Quer que eu já execute `1.1` agora e mostre `typecheck+build` na sua frente?
