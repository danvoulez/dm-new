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

## Próximos `go` que preciso de você (1 por vez)

1. `go corrigir DNS` — `cloudflared tunnel route dns -f ef64804c... llm.minilab.work` (corrige `llm.min.minilab.work`).
2. `go subir bridge` — `python3 /tmp/golden-bridge-server.py` + `curl` local.
3. `go deploy` — `wrangler deploy` + `curl` vivo `api.carbonlab.work/api/models`.

Diz `go 1` que eu só faço o 1 e mostro o `curl` antes do 2.
