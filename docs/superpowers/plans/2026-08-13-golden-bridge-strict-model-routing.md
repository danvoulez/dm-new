# Dream Conversation, LogLine Activation and Golden Bridge Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a conversa da Dream fluir normalmente, compor LogLine somente quando necessário, ativar apenas Acts que satisfaçam a semântica do processo explicitamente desejado e transportar tudo pela Golden Bridge sem alteração ou fallback.

**Architecture:** Dream é dona do system prompt, das ferramentas, dos contratos e da composição LogLine. Um Act válido sempre pode ser registrado; ativação é uma segunda decisão, baseada no `process_id` explícito e no `activation_ritual` daquele processo, que redefine o significado e a origem dos nove campos. Golden Bridge é a única provedora visível e apenas cataloga, roteia e transporta o envelope para Local, Vercel ou Cloudflare.

**Tech Stack:** TypeScript 5.9, Hono, Postgres/Hyperdrive, D1, React 19, TanStack Query, Vitest, Node.js 20+, `node:test`, Golden Bridge no LAB 8GB e Cloudflare Workers/Pages.

**Spec:** `docs/superpowers/specs/2026-08-13-golden-bridge-strict-model-routing-design.md`

## Restrições globais

- Conversa comum não produz LogLine, não consulta catálogo e não chama ferramenta sem necessidade.
- Registro LogLine e ativação processual são fatos separados.
- Registro simples não tem `process_id`; fica `registered + inert`.
- Consequência desejada exige `process_id` e hash de contrato explícitos.
- `if_ok` nunca seleciona processo; não existe casamento por primeiro contrato completo.
- Cada processo define significado, fonte e predicado para cada slot.
- O LLM interpreta e propõe; o evaluator valida e decide ativação.
- Golden Bridge, Vercel e Cloudflare não conhecem LogLine e não alteram prompts/tools.
- Modelo e origem são escolhidos explicitamente; não existe `Automático`, sticky model ou fallback.
- Erro de ativação preserva o registro; erro de modelo preserva a mensagem humana.
- TDD nos contratos centrais; uma suíte E2E pequena prova o trajeto real.

---

## Task 1: Preservar a semântica do `activation_ritual`

**Files:**

- Modify: `lab/contracts.py`
- Modify: `workers/api/src/contracts.ts`
- Modify: `processes/PROCESS_CONTRACT_TEMPLATE.yml`
- Modify: `lab/resources/processes/PROCESS_CONTRACT_TEMPLATE.yml`
- Modify: `tests/test_contracts.py`
- Create: `workers/api/tests/contract-semantics.mjs`

**Interfaces:**

- Produces Python `ProcessContract.slot_rules: dict[str, SlotRule]`.
- Produces TypeScript `ProcessContract.slot_rules?: Partial<Record<Slot, SlotRule>>`.
- `SlotRule = { meaning: string; source: "llm" | "session" | "clock" | "contract" | "evidence"; predicate: string; values?: string[] }`.

- [ ] **Step 1: Escrever testes que expõem a perda semântica atual**

Criar um contrato fixture cujas regras sejam distintas e afirmar:

```python
contract = load_contract(path)
assert contract.slot_rules["who"].predicate == "who.authorized"
assert contract.slot_rules["who"].source == "session"
assert contract.slot_rules["did"].values == ("request_projection",)
assert contract.slot_rules["this"].meaning == "alvo canônico da projeção"
```

No Worker, testar que `toProcessTypeView()` preserva `slot_rules` e `registered_hash`.

Run:

```bash
pytest -q tests/test_contracts.py
cd workers/api && node --disable-warning=ExperimentalWarning --experimental-strip-types tests/contract-semantics.mjs
```

Expected: FAIL porque o parser atual guarda apenas os nomes dos slots.

- [ ] **Step 2: Definir o formato mínimo do contrato**

```yaml
activation_ritual:
  slots:
    who: {meaning: "autoridade solicitante", source: session, predicate: who.authorized}
    did: {meaning: "ato admitido", source: llm, predicate: did.allowed, values: [request_projection]}
    this: {meaning: "alvo canônico", source: llm, predicate: this.canonical}
    when: {meaning: "instante de registro", source: clock, predicate: when.registered_at}
    confirmed_by: {meaning: "confirmação do rito", source: session, predicate: confirmed_by.authority}
    if_ok: {meaning: "continuidade de sucesso", source: contract, predicate: if_ok.compatible}
    if_doubt: {meaning: "continuidade de dúvida", source: contract, predicate: if_doubt.compatible}
    if_not: {meaning: "continuidade negativa", source: contract, predicate: if_not.compatible}
    status: {meaning: "estado inicial", source: contract, predicate: status.initial}
  required_aux: [projection_spec]
  optional_aux: [parent_projection_hashes]
```

Manter leitura de contratos compactos durante a migração, mapeando-os para regras `*.present`. Contratos capazes de consequência não ficam `runnable` até receber regras explícitas.

- [ ] **Step 3: Implementar parsing e validação sem descarte silencioso**

Falhar para source desconhecida, predicate vazia, slot fora da tupla, `values` inválido ou processo runnable sem as nove regras. Preservar o mapa completo no Postgres e na projeção pública detalhada.

- [ ] **Step 4: Passar testes e regenerar dados derivados**

Atualizar `migrations/0004_process_contracts.sql` e `workers/api/src/seed-contracts.ts` pelo gerador do projeto, sem editar o dump manualmente.

```bash
pytest -q tests/test_contracts.py tests/test_contract_parser_hardening.py
cd workers/api && npm run typecheck && npm test
```

---

## Task 2: Fazer o evaluator distinguir presença, compatibilidade e ativação

**Files:**

- Create: `lab/activation_predicates.py`
- Create: `workers/api/src/activation-predicates.ts`
- Modify: `lab/evaluator.py`
- Modify: `workers/api/src/evaluator.ts`
- Create: `tests/test_activation_semantics.py`
- Create: `workers/api/tests/activation-semantics.mjs`

**Interfaces:**

- `evaluate_slot(rule, value, context) -> {passed, code, expected, observed}`.
- `evaluate()` preserva a API atual e passa a devolver `field_levels` detalhado.

- [ ] **Step 1: Escrever a matriz vermelha de ativação**

```text
sem process_id                         -> registered + inert
process_id desconhecido                -> registered + inert / unknown_process
campo presente mas did não admitido    -> registered + incompatible
who não autorizado                     -> registered + doubted
AUX ausente                            -> registered + incompleto
todos predicados válidos, sem adapter   -> registered + doubted
todos válidos, adapter e grants válidos -> registered + ativável
```

Regressões obrigatórias:

```python
assert select_process(act_without_process_id, catalog) is None
assert evaluate({**act, "if_ok": "projection-build.v1"}, catalog)["matched"] is False
```

- [ ] **Step 2: Implementar somente o vocabulário necessário**

```text
who.present, who.authorized
did.present, did.allowed
this.present, this.canonical, this.content_hash
when.registered_at, when.future
confirmed_by.present, confirmed_by.authority, confirmed_by.evidence_hash
if_ok.compatible, if_doubt.compatible, if_not.compatible
status.initial
```

Cada predicado é função explícita. Não adicionar `eval`, JSON Logic, CEL ou novo rules engine.

- [ ] **Step 3: Remover atalhos de seleção**

```python
def select_process(receipt, catalog):
    process_id = str(receipt.get("process_id") or "")
    return catalog.get(process_id) if process_id else None
```

Não consultar `if_ok` e não iterar sobre `catalog.values()`.

- [ ] **Step 4: Produzir diagnóstico de campo útil**

```json
{
  "did": {
    "predicate": "did.allowed",
    "expected": ["request_projection"],
    "observed": "register",
    "passed": false,
    "code": "did_not_admitted"
  }
}
```

- [ ] **Step 5: Rodar paridade Python/Worker**

```bash
pytest -q tests/test_activation_semantics.py tests/test_contracts.py
cd workers/api
npm run test:evaluator-parity
node --disable-warning=ExperimentalWarning --experimental-strip-types tests/activation-semantics.mjs
npm run typecheck
```

---

## Task 3: Restaurar conversa normal e formalização consultiva

**Files:**

- Modify: `lab/resources/prompts/process_ingress.v1.txt`
- Modify: `lab/resources/schemas/llm/process_ingress.v1.json`
- Create: `workers/api/src/dream-agent.ts`
- Create: `workers/api/src/process-tools.ts`
- Modify: `workers/api/src/chat.ts`
- Modify: `workers/api/src/chat-core.ts`
- Modify: `workers/api/src/index.ts`
- Create: `workers/api/tests/dream-agent.mjs`
- Create: `workers/api/tests/process-tools.mjs`

**Interfaces:**

- `searchProcesses(client, query) -> ProcessSearchResult[]`.
- `readProcessContract(client, processId) -> ProcessContractForLLM`.
- `assembleAct(proposal, sources) -> ActFields`, recusando slots fornecidos pela fonte errada.
- `runDreamTurn()` suporta resposta normal ou consulta/formalização.

- [ ] **Step 1: Escrever testes vermelhos do comportamento humano**

```text
"bom dia"                     -> resposta normal; zero process tools; zero registro
"o que está parado?"          -> consulta de estado; zero LogLine novo
"registre que o Q3 fechou"    -> Act sem process_id; registered + inert
"crie o resumo do Q3"         -> search + read contract + Act processual
dois pedidos numa frase        -> dois Acts registrados
"não, era Q4"                 -> novo Act citando o anterior; nada editado
```

O teste usa LLM fake e registra a sequência de tool calls; não depende da redação exata.

- [ ] **Step 2: Tornar contratos consultáveis sob demanda**

Adicionar:

```text
GET /api/process-types?query=<texto>
GET /api/process-types/:process_id
```

A resposta detalhada inclui `registered_hash`, purpose, regras por slot, AUX, exemplos, danger/readiness e consequência. Sem hash resolvível, o processo aparece como `contract_not_citable` e não ativa por composição LLM.

- [ ] **Step 3: Corrigir `process_ingress.v1`**

```json
{
  "acts": [
    {
      "process_id": "projection-build.v1",
      "contract_hash": "64-hex",
      "slots": {"did": "request_projection", "this": "Q3"},
      "fields": {"projection_spec": "resumo do Q3"},
      "missing": [],
      "citations": ["64-hex"]
    }
  ]
}
```

Para registro puro, `process_id` e `contract_hash` ficam ausentes. O Worker recusa slots cuja regra não tenha `source: llm`.

- [ ] **Step 4: Usar system prompt curto e ferramentas sob demanda**

Remover catálogo inteiro, grants, modelos e estado do runtime do prompt global. Disponibilizar:

```text
search_processes
read_process_contract
formalize_acts
get_case
get_pendencies
```

Ferramentas de grants/passkey entram apenas no contexto de autorização.

- [ ] **Step 5: Montar o Act conforme a fonte declarada**

- `llm`: interpretação após leitura do contrato;
- `session`: identidade autenticada;
- `clock`: timestamp do Worker;
- `contract`: valor literal da lei citada;
- `evidence`: referência já verificada.

Sobreposição indevida retorna `slot_source_violation`; nada é corrigido escondido.

- [ ] **Step 6: Registrar antes de avaliar**

Usar `registerFlow()` para cada Act. L0/L1 não ganha `confirm_register`. Para L4/L5, registrar a intenção e devolver separadamente a exigência de grant/signoff.

- [ ] **Step 7: Remover o pipeline paralelo**

Remover `/api/chat/compile`, seu Mistral default e a lógica duplicada. `POST /api/chat/turn` vira o único ingresso conversacional.

- [ ] **Step 8: Rodar testes**

```bash
cd workers/api
node --disable-warning=ExperimentalWarning --experimental-strip-types tests/process-tools.mjs
node --disable-warning=ExperimentalWarning --experimental-strip-types tests/dream-agent.mjs
npm run typecheck
npm test
```

---

## Task 4: Tornar a Golden Bridge transparente e estrita

**Files (Golden Bridge):**

- Modify: `src/promptPolicy.js`
- Modify: `src/aiProvider.js`
- Modify: `src/server.js`
- Modify: `config/lab-block.json`
- Delete: `config/system-policy.txt`
- Modify: `test/promptPolicy.test.js`
- Create: `test/transportParity.test.js`
- Create: `test/strictRouting.test.js`

- [ ] **Step 1: Escrever teste de transcrição que falha hoje**

Enviar envelope sintético com system, user, assistant tool call, tool result e JSON Schema. Afirmar igualdade canônica entre entrada e body upstream após remover somente `model` e campos de rota.

Expected: FAIL porque `systemMode: replace` apaga system e `toUpstreamBody()` descarta tools/schema.

- [ ] **Step 2: Remover política de prompt da Bridge**

Eliminar `systemMode`, `systemPolicyFile` e o prompt local. Validar forma/tamanho sem reescrever, concatenar ou aplicar `trim()` ao conteúdo.

- [ ] **Step 3: Encaminhar o envelope sem perdas**

Preservar `messages`, `tools`, `tool_choice`, `tool_calls`, `tool_call_id`, `response_format`, parâmetros e streaming. Campo pedido mas não suportado retorna `model_capability_mismatch`; nunca é descartado.

- [ ] **Step 4: Exigir rota canônica sem fallback**

- ausente: 400 `model_required`;
- desconhecido: 404 `model_unknown`;
- uma chamada ao upstream exato;
- Vercel fixa `providerOptions.gateway.only`;
- Cloudflare fixa gateway e `cf-aig-max-attempts: 1`;
- requested diferente de executed: 502 `route_mismatch`.

- [ ] **Step 5: Rodar testes**

```bash
cd /Users/ubl-ops/Documents/Codex/2026-08-13/build/work/golden-bridge-current
node --test test/promptPolicy.test.js test/transportParity.test.js test/strictRouting.test.js
npm test
```

---

## Task 5: Catálogo certificado e seletor no composer

**Files:**

- Golden Bridge Create: `src/catalog.js`
- Golden Bridge Create: `test/catalog.test.js`
- Golden Bridge Modify: `src/server.js`
- Dream Create: `workers/api/src/model-catalog.ts`
- Dream Modify: `workers/api/src/chat.ts`
- Dream Modify: `ui/src/lib/dm-api.ts`
- Dream Create: `ui/src/components/chat/ModelPicker.tsx`
- Dream Create: `ui/src/components/chat/ModelPicker.test.tsx`
- Dream Modify: `ui/src/pages/Home.tsx`
- Dream Modify: `ui/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Agregar catálogo vivo por origem**

Local vem de health/models dos perfis exatos; Vercel vem do catálogo live; Cloudflare exige catálogo Workers AI e gateway comprovado. Falha vira `degraded` ou `not_configured`, nunca modelo inventado.

- [ ] **Step 2: Certificar `dream-agent.v1`**

Cada modelo selecionável prova conversa normal, tool call, retorno de tool, schema e system prompt intacto. Certificação tem timestamp e expira; não é inferida do nome.

- [ ] **Step 3: Exigir modelo explícito no Worker**

Remover `selectModel`, primeiro item e preferência Mistral. O mesmo modelo permanece no loop do turno; falha exige troca humana.

- [ ] **Step 4: Colocar picker dentro do composer**

Usar `cmdk` instalado, agrupar Local/Vercel/Cloudflare e remover `Automático`. Sem seleção válida, envio fica bloqueado. Origem indisponível aparece com mensagem e ação.

- [ ] **Step 5: Mostrar custódia e movimento separadamente**

```text
Registrado · a3f9c2d1
Andando | Esperando | Apenas registrado
```

`registered + inert/incompleto/doubted` nunca vira erro de registro.

- [ ] **Step 6: Rodar testes UI/API**

```bash
cd workers/api && npm run typecheck && npm test
cd ../../ui && npm run typecheck && npm test && npm run build
```

---

## Task 6: Provar o comportamento completo com poucas suítes fortes

**Files:**

- Create: `workers/api/tests/conversation-ingress-e2e.mjs`
- Create: `scripts/acceptance/model-routing.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Consolidar o gate de CI**

```bash
pytest -q
(cd workers/api && npm ci --legacy-peer-deps && npm run typecheck && npm test)
(cd ui && npm ci && npm run typecheck && npm test && npm run build)
```

Não criar job por invariante; os scripts devolvem exit code e um relatório único.

- [ ] **Step 2: Provar os sete casos de produto**

```text
1. conversa comum: zero formalização
2. registro simples: registered + inert, sem process_id
3. processo correto: contrato citado, campos compatíveis, ativável
4. campo semanticamente errado: registered + incompatible, zero dispatch
5. campo ausente: registered + incompleto
6. dois atos: dois hashes
7. correção: novo hash cita o anterior
```

- [ ] **Step 3: Provar transporte/rota por origem**

Para um modelo certificado de cada origem configurada: system/messages/tools/schema preservados, requested=executed, `fallback=false`, tool round-trip completo e nenhuma segunda origem após falha.

- [ ] **Step 4: Provar zero dispatch indevido**

Correlacionar ledger e `runtime_queue`: Acts inert/incompleto/incompatible não geram dispatch. O executor reavalia o contrato antes de qualquer efeito.

---

## Task 7: Implantar com candidate, rollback e segurança essenciais

**Files:**

- Modify: Golden Bridge `docs/OPERATIONS.md`
- Create: Dream `docs/operations/dream-ingress.md`

- [ ] **Step 1: Rotacionar credenciais expostas**

Rotacionar a chave Supabase colada na conversa e tokens encontrados em argumentos de processo. Atualizar consumidores pelo nome, provar a nova chave e só então revogar a anterior. Não registrar valores.

- [ ] **Step 2: Subir Bridge candidate em 8788**

Guardar commit ativo e configuração sanitizada. Rodar a Task 6 contra `127.0.0.1:8788`. Fault injection usa fixtures; não para upstream de produção.

- [ ] **Step 3: Ativar Bridge e provar rollback**

Trocar 8787 pelo commit candidato e verificar health, catálogo, tool round-trip e falha sem fallback. Depois voltar uma vez ao commit anterior, provar health, e reativar o candidato. Isso valida o runbook sem criar sistema próprio de releases.

- [ ] **Step 4: Abrir PR do Dream e observar deploy**

Bridge compatível entra primeiro. Depois PR do Dream, CI verde, merge e observação gate → migrate → API → UI. Workflow verde não substitui prova pública.

- [ ] **Step 5: Aceitação no produto público**

Em `https://app.carbonlab.work`: picker no composer, conversa normal, registro simples inert, formalização com fingerprint/estado separado, erro de modelo com request ID e nenhuma opção automática.

- [ ] **Step 6: Fechar por componente**

Relatar separadamente: contratos semânticos, evaluator, conversa/formalização, transporte Golden Bridge, Local, Vercel, Cloudflare, UI, rollback e segredos.

## Critério final

O trabalho termina quando uma pessoa pode conversar sem sentir a ontologia, pedir um registro e vê-lo preservado, pedir uma consequência e ver o LLM consultar a lei correta, compor o Act segundo aquela interpretação, registrá-lo e receber do evaluator um estado honesto — enquanto Golden Bridge apenas transporta o pedido para o modelo explicitamente escolhido.
