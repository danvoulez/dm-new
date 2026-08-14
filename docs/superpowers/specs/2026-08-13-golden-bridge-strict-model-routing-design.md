# Golden Bridge: catálogo vivo, rota estrita e seletor no composer

**Estado:** especificação aprovada para planejamento em 2026-08-13  
**Autoridade do produto:** Dan / Powerfarm  
**Sistemas:** Golden Bridge no LAB 8GB, `dm-new` Worker/API e UI pública  
**Fora de escopo:** novo provedor além de local, Vercel AI Gateway e Cloudflare AI Gateway; fallback automático; seleção de modelo por heurística; exposição direta dos gateways ao navegador.

## 1. Resultado humano

Dentro da caixa de prompt existe um seletor pesquisável de modelos. A pessoa escolhe uma opção publicada pela Golden Bridge e vê de qual categoria ela vem: `Local`, `Vercel AI Gateway` ou `Cloudflare AI Gateway`.

Nenhuma camada escolhe, troca, reescreve ou tenta outro modelo silenciosamente. Se o modelo escolhido não puder responder, a conversa mostra qual modelo falhou, em qual etapa, um identificador de diagnóstico e a ação concreta: escolher outra opção da Golden Bridge.

## 2. Fatos observados que este desenho corrige

Em 2026-08-13, as seguintes observações foram reproduzidas no runtime real:

- `https://api.carbonlab.work/api/models` devolveu cinco IDs estáticos sem categoria `provider`.
- O composer de `ui/src/pages/Home.tsx` não continha seletor. O único seletor ficava escondido em configurações e oferecia `Automático`.
- `workers/api/src/chat.ts::selectModel` escolhia `mistral-nemo-q4` quando o pedido omitia o modelo ou trazia um ID desconhecido.
- Um pedido público com `model: "does-not-exist"` respondeu HTTP 200 e os recibos da Golden Bridge registraram duas chamadas a `mistral-nemo-q4`.
- A Golden Bridge usava o último modelo selecionado quando `model` era omitido. Depois de GPT, uma chamada sem modelo executou GPT novamente.
- O catálogo Vercel real continha 324 modelos; `/v1/models` da Golden Bridge publicava somente cinco itens do arquivo de configuração.
- A Golden Bridge conseguia executar `qwen2.5-3b`, `mistral-nemo-q4`, `gpt-4.1-mini`, `claude-haiku-4.5` e `gemini-2.5-flash` em probes curtos, mas um erro upstream 400 foi transformado em 500 e expôs texto técnico excessivo.
- O LAB 8GB tinha 61 modelos Workers AI listáveis, 26 deles de geração de texto. A credencial OAuth corrente não conseguiu listar a configuração de AI Gateway (`Authentication error`), portanto a existência de um gateway Cloudflare utilizável não foi comprovada.
- Tokens de túnel Cloudflare apareceram nos argumentos de processos. Eles devem ser rotacionados e retirados da linha de comando.

Testes e health sintéticos não substituem essas observações nem as provas finais descritas nesta especificação.

## 3. Fronteira de autoridade

```text
Browser
  -> dm-new UI
  -> dm-new Worker /api/models e /api/chat/turn
  -> Golden Bridge /v1/models e /v1/chat/completions
      -> executor local exato
      -> Vercel AI Gateway com provedor exato
      -> Cloudflare AI Gateway com uma tentativa
```

Regras:

1. O browser nunca chama Vercel ou Cloudflare diretamente.
2. O Worker nunca mantém uma lista própria de modelos nem decide fallback.
3. A Golden Bridge é a única autoridade de catálogo e rota.
4. Catálogo e execução são verdades diferentes. `catalogued` não significa `healthy`.
5. Um modelo só aparece como selecionável quando sua origem foi consultada com sucesso dentro do TTL vigente.
6. Uma falha de origem aparece em `sources[]`; ela não é substituída por dados estáticos ou por outra origem.

## 4. IDs canônicos

IDs carregam a rota para impedir colisão e ambiguidade:

```text
local/qwen2.5-3b
local/mistral-nemo-q4
vercel/openai/gpt-4.1-mini
vercel/anthropic/claude-haiku-4.5
cloudflare/@cf/openai/gpt-oss-120b
```

Gramática:

```text
local/<profile-id>
vercel/<creator>/<model>
cloudflare/<cloudflare-model-id>
```

Os cinco IDs antigos podem existir durante uma janela de compatibilidade como aliases determinísticos, nunca como fallback:

```json
{
  "qwen2.5-3b": "local/qwen2.5-3b",
  "mistral-nemo-q4": "local/mistral-nemo-q4",
  "gpt-4.1-mini": "vercel/openai/gpt-4.1-mini",
  "claude-haiku-4.5": "vercel/anthropic/claude-haiku-4.5",
  "gemini-2.5-flash": "vercel/google/gemini-2.5-flash"
}
```

O alias usado deve aparecer no recibo como `alias_used`. Aliases não aparecem no catálogo novo e são removidos após sete dias consecutivos sem uso observado.

## 5. Contrato do catálogo

`GET /v1/models` retorna:

```json
{
  "object": "list",
  "provider": "golden-bridge",
  "generated_at": "2026-08-13T12:00:00.000Z",
  "ttl_seconds": 300,
  "sources": [
    {
      "id": "local",
      "state": "ready",
      "count": 2,
      "fetched_at": "2026-08-13T12:00:00.000Z",
      "error": null
    },
    {
      "id": "vercel-ai-gateway",
      "state": "ready",
      "count": 180,
      "fetched_at": "2026-08-13T12:00:00.000Z",
      "error": null
    },
    {
      "id": "cloudflare-ai-gateway",
      "state": "not_configured",
      "count": 0,
      "fetched_at": null,
      "error": {
        "code": "provider_not_configured",
        "message": "Cloudflare AI Gateway não está configurado na Golden Bridge.",
        "action": "Configure uma credencial dedicada e o gateway golden-bridge."
      }
    }
  ],
  "data": [
    {
      "id": "local/qwen2.5-3b",
      "object": "model",
      "name": "Qwen 2.5 3B",
      "provider": "local",
      "upstream_provider": "llama.cpp",
      "upstream_model": "default",
      "model_type": "language",
      "catalogued": true,
      "executor": "LAB-8GB",
      "context_window": 8192,
      "max_output_tokens": 512,
      "pricing": null
    }
  ]
}
```

Semântica de origem:

- `ready`: a consulta atual terminou dentro do TTL e o resultado foi validado.
- `degraded`: a consulta falhou; nenhum modelo dessa origem é publicado nessa resposta.
- `not_configured`: faltam URL, conta, gateway ou credencial; nenhum modelo é publicado.

O cache é somente em memória, por 300 segundos, separado por origem. Ao expirar, uma falha de refresh não serve o catálogo antigo como se fosse atual. O estado antigo pode aparecer apenas em `/ops/providers` com `stale: true`; ele não entra em `data` público.

Fontes:

- Local: perfis declarados na configuração e confirmados por `/health` + `/v1/models` do upstream exato.
- Vercel: `GET https://ai-gateway.vercel.sh/v1/models`, filtrado por `type === "language"`.
- Cloudflare: `GET /accounts/{account_id}/ai/models/search`, filtrado pela tarefa `Text Generation`.

## 6. Contrato de execução estrita

`POST /v1/chat/completions` exige `model` canônico não vazio. Ausência retorna 400. ID que não está no catálogo vigente retorna 404. O estado do supervisor não participa da escolha.

### Local

- Resolve somente o perfil exato de `local/<profile-id>`.
- Faz uma única chamada ao upstream declarado.
- Não tenta outro executor local.

### Vercel AI Gateway

- Remove o prefixo `vercel/` para obter `creator/model`.
- Envia `providerOptions.gateway.only: [creator]`.
- Não envia `providerOptions.gateway.models`.
- Não repete a requisição.
- Rejeita resposta cujo `model` não corresponda ao modelo upstream solicitado.

### Cloudflare AI Gateway

- Remove o prefixo `cloudflare/` para obter o ID Cloudflare.
- Usa a API OpenAI-compatible da conta.
- Envia `cf-aig-gateway-id: golden-bridge`.
- Envia `cf-aig-max-attempts: 1` e `cf-aig-skip-cache: true`.
- Não usa Dynamic Routing. O preflight bloqueia o release se houver rota dinâmica ativa no gateway `golden-bridge`.
- Rejeita resposta cujo `model` não corresponda ao solicitado.

## 7. Recibo de rota

Toda conclusão não-streaming inclui:

```json
{
  "model": "vercel/openai/gpt-4.1-mini",
  "lab": {
    "requested_model": "vercel/openai/gpt-4.1-mini",
    "executed_model": "vercel/openai/gpt-4.1-mini",
    "source": "vercel-ai-gateway",
    "upstream_provider": "openai",
    "upstream_model": "openai/gpt-4.1-mini",
    "fallback": false,
    "alias_used": null,
    "request_id": "...",
    "upstream_ms": 410,
    "tokens_total": 42,
    "cost_usd": 0.00003
  }
}
```

Headers equivalentes:

```text
x-lab-request-id
x-lab-requested-model
x-lab-executed-model
x-lab-source
x-lab-fallback: false
```

O Worker verifica `requested_model === executed_model` antes de aceitar a saída. O turno usa o mesmo modelo explícito nas chamadas de planner e resposta. O resultado `/api/chat/turn` devolve os dois request IDs e o recibo de rota.

## 8. Erros legíveis

Formato único:

```json
{
  "error": {
    "code": "model_unavailable",
    "message": "O modelo vercel/openai/gpt-4.1-mini não respondeu pela rota Vercel AI Gateway.",
    "action": "Escolha outro modelo da Golden Bridge e envie novamente.",
    "request_id": "...",
    "model": "vercel/openai/gpt-4.1-mini",
    "source": "vercel-ai-gateway",
    "stage": "upstream_completion",
    "upstream_status": 503
  }
}
```

Códigos e HTTP:

| HTTP | Código | Condição |
|---:|---|---|
| 400 | `model_required` | campo ausente ou vazio |
| 404 | `model_unknown` | ID fora do catálogo vigente |
| 409 | `model_catalog_changed` | seleção persistida deixou de existir |
| 502 | `model_unavailable` | upstream respondeu erro |
| 502 | `route_mismatch` | modelo retornado difere do solicitado |
| 503 | `catalog_unavailable` | origem do catálogo indisponível |
| 504 | `model_timeout` | timeout de uma única tentativa |

O corpo técnico upstream não vai ao browser. Logs estruturados guardam status, código sanitizado e até 500 caracteres sem headers, tokens ou prompt. A UI preserva `code`, `action` e `request_id` e os mostra em linguagem simples.

## 9. Conversa, LogLine e formalização

LogLine não é o idioma permanente do chat, nem um envelope que acompanha toda chamada ao modelo. A conversa permanece natural. O LLM só entra no modo de composição quando a pessoa pede para registrar, formalizar ou produzir uma consequência governada.

Há duas validades independentes:

1. **Validade LogLine:** a intenção foi congelada na tupla de nove campos, canonicalizada e registrada. Isso dá custódia; não dá movimento.
2. **Compatibilidade processual:** os nove campos e AUX satisfazem os significados, origens e predicados definidos pelo processo explicitamente pretendido. Somente isso permite ativação.

Um pedido de simples registro produz um Act sem `process_id`. Ele é registrado e permanece `inert`; o runtime não tenta encaixá-lo em um processo por semelhança ou eliminação. Quando a intenção inclui uma consequência, o LLM consulta o contrato ativo, compõe segundo aquela lei e cita a versão consultada.

```text
conversa normal
  -> resposta normal

pedido de simples registro
  -> composição LogLine universal
  -> registro sem process_id
  -> registered + inert

pedido de consequência/processo
  -> search_processes
  -> read_process_contract(process_id)
  -> composição segundo o activation_ritual citado
  -> registro sempre
  -> evaluator: inert | incompleto | doubted | ativável
```

O system prompt do Dream contém apenas orientação estável:

> Converse normalmente. Não transforme toda mensagem em LogLine. Quando houver pedido de registro ou formalização, preserve a intenção na forma LogLine. Quando houver consequência ou processo desejado, consulte primeiro o contrato ativo e interprete cada campo segundo esse processo. Não invente identidade, autoridade, confirmação ou evidência. Registrar não significa ativar; somente o evaluator determina se a forma satisfez o processo.

O catálogo, contratos, estado do runtime, grants e modelos não são despejados em todo turno. O LLM recebe ferramentas de consulta e lê apenas o necessário.

## 10. Semântica de ativação por processo

Cada processo reinterpreta operacionalmente os nove campos. Presença não é compatibilidade. O contrato precisa preservar, para cada slot:

```yaml
activation_ritual:
  slots:
    who:
      meaning: "autoridade que solicita a consequência"
      source: session
      predicate: who.authorized
    did:
      meaning: "ato admitido por este processo"
      source: llm
      predicate: did.allowed
      values: [request_projection]
    this:
      meaning: "alvo canônico da projeção"
      source: llm
      predicate: this.canonical
    when:
      meaning: "instante de registro"
      source: clock
      predicate: when.registered_at
    confirmed_by:
      meaning: "evidência de confirmação exigida pelo rito"
      source: session
      predicate: confirmed_by.authority
    if_ok:
      meaning: "continuidade admitida quando ativável"
      source: contract
      predicate: if_ok.compatible
    if_doubt:
      meaning: "continuidade admitida quando há dúvida"
      source: contract
      predicate: if_doubt.compatible
    if_not:
      meaning: "continuidade admitida quando não deve seguir"
      source: contract
      predicate: if_not.compatible
    status:
      meaning: "estado inicial aceito pelo rito"
      source: contract
      predicate: status.initial
  required_aux: [projection_spec]
  optional_aux: [parent_projection_hashes]
```

`source` define quem pode fornecer o valor: `llm`, `session`, `clock`, `contract` ou `evidence`. O LLM só propõe campos cuja origem permite `llm`; o Worker monta o Act com as demais fontes e recusa sobreposição.

Os predicados pertencem a um vocabulário fechado e executável do backend. O parser preserva o mapa completo; o evaluator executa cada predicado e devolve níveis reais, não `${slot}.present`. O resultado inclui, por slot, `expected`, `observed`, `passed` e um código de falha sanitizado.

Regras obrigatórias:

- `process_id` é a identidade explícita do rito; `if_ok` não seleciona processo.
- `select_process` nunca escolhe o primeiro contrato que parece completo.
- Ausência de `process_id` significa registro sem processo, deliberadamente `inert`.
- Processo desconhecido ou hash de contrato divergente não ativa.
- Falha semântica não invalida a custódia: o Act continua registrado e visível.
- Risco, grant, evidência, adapter e readiness continuam gates posteriores à compatibilidade semântica.

`GET /api/process-types` fornece uma busca leve. `GET /api/process-types/:process_id` devolve a versão ativa completa, sua orientação de ingresso, exemplos, regras por slot, AUX, consequence/risk/readiness e `registered_hash`. Essa é a resposta consultada pelo LLM para “como escrever corretamente para este processo?”.

## 11. Trajeto exato entre cliente e modelo

O Dream é dono da conversa, do system prompt, das ferramentas e da interpretação LogLine. Golden Bridge, Vercel e Cloudflare não conhecem LogLine.

```text
texto do cliente
  -> Dream acrescenta system prompt + ferramentas de consulta
  -> Golden Bridge valida tamanho/autorização e preserva o envelope
  -> adaptador troca somente model/credencial/headers de rota
  -> upstream recebe mensagens e ferramentas semanticamente idênticas
```

A Golden Bridge não injeta, substitui, concatena ou remove system prompts. Ela encaminha, quando suportados pelo modelo escolhido: `messages`, `tools`, `tool_choice`, `tool_calls`, `tool_call_id`, `response_format`, parâmetros de geração e streaming. Campos não suportados produzem `model_capability_mismatch`; nunca são descartados silenciosamente.

O catálogo marca capacidades comprovadas por modelo. Apenas modelos que passam a suíte `dream-agent.v1` — conversa comum, consulta de contrato, tool round-trip e composição estruturada — ficam selecionáveis na Dream.

Testes de transcrição com payloads sintéticos comparam hashes canônicos em quatro pontos: entrada do Worker, saída do Worker, entrada da Bridge e saída do adaptador. Os hashes excluem apenas `model`, credenciais e headers de roteamento. Prompts reais e conteúdo humano não entram em logs.

## 12. UI do composer

O seletor fica na faixa inferior esquerda da caixa de prompt; o botão enviar permanece à direita.

```text
┌──────────────────────────────────────────────────────────┐
│ Escreva como você falaria...                             │
│                                                          │
│ [ Local · Qwen 2.5 3B  ▾ ]                    [ Enviar ] │
└──────────────────────────────────────────────────────────┘
```

Ao abrir, um painel pesquisável agrupa modelos por origem. Cada grupo mostra estado de catálogo, não uma falsa luz de saúde. `Cloudflare AI Gateway — não configurado` permanece visível como estado, mas sem opções inventadas.

Regras de interação:

- Não existe opção `Automático`.
- Sem seleção, enviar fica desabilitado e o texto auxilia `Escolha um modelo`.
- A seleção pode persistir no navegador, mas fica sempre visível no composer.
- Se o catálogo novo não contiver a seleção persistida, a UI limpa a seleção e mostra `Este modelo saiu do catálogo. Escolha outro.`
- Cada resposta mostra uma linha discreta com modelo executado e ID curto de diagnóstico.
- Falha nunca apaga o prompt nem cria resposta de sucesso.
- Teclado, foco visível, leitor de tela e mobile são obrigatórios.

## 13. Health e observabilidade

`/health` deixa de chamar todo modelo de cloud de `healthy`. Ele relata:

- processo Golden Bridge: `ok`;
- upstreams locais: health real e último probe;
- origens externas: `catalog_state`, `catalog_age_seconds`, `last_error`;
- nenhuma afirmação por modelo cloud sem inferência real.

`/ops/providers` autenticado expõe configuração sanitizada, TTL, última consulta, última execução por origem, contadores de erro e zero segredo.

Métricas mínimas:

```text
golden_bridge_catalog_refresh_total{source,result}
golden_bridge_completion_total{source,result}
golden_bridge_route_mismatch_total{source}
dream_activation_total{state,process_id}
dream_contract_predicate_failure_total{predicate}
```

O Worker gera ou preserva um `x-request-id` e a Bridge o inclui no recibo. Logs nunca contêm prompt, token, Access secret ou chave de gateway.

## 14. Segredos e autoridade operacional

- Criar uma credencial Cloudflare dedicada com apenas `Account > Workers AI > Read` e `Account > AI Gateway > Read`, ampliando para Write somente no passo separado de criação/configuração do gateway.
- Armazenar chaves da Bridge em arquivos `0600` fora do release e fora do Git.
- Não colocar segredo em argumento de processo, plist versionada, JSON de configuração, log ou comando persistido no histórico.
- Rotacionar os tokens de túnel expostos no diagnóstico e usar credencial de named tunnel/config file em vez de `cloudflared ... --token <valor>`.
- Preservar `com.project-manhattan.agent` e as políticas locais existentes.
- A criação ou alteração de gateway, token ou rota externa exige registro do operador e prova read-back sem valor secreto.

## 15. Release e rollback

Uma branch e um commit identificam o candidato. A Golden Bridge nova sobe primeiro em `127.0.0.1:8788`, sem substituir 8787, e executa os acceptance tests. Antes da troca, preservar o commit ativo e uma cópia sanitizada da configuração. Rollback faz checkout do commit anterior, reinicia o LaunchAgent e confirma catálogo, erro estrito e uma conclusão local. Não criar um segundo sistema de releases enquanto Git + candidate + rollback comprovado resolverem o problema.

O `dm-new` entra depois da Bridge compatível. Merge em `main` continua disparando gate, migrate, API e UI. A prova final usa os domínios públicos e os recibos remotos; workflow verde sozinho não fecha o trabalho.

## 16. Critérios de aceitação

O trabalho só fecha quando todos forem verdadeiros:

1. O composer público contém o seletor pesquisável e não contém `Automático`.
2. Sem modelo, browser e API bloqueiam; a Bridge responde `model_required`.
3. ID desconhecido responde 404 e produz zero chamada upstream.
4. Selecionar cada local executa exatamente esse local.
5. Selecionar um modelo Vercel executa o mesmo modelo com um único provedor permitido.
6. Selecionar um modelo Cloudflare executa o mesmo modelo com `max-attempts: 1`.
7. Desligar um local produz erro legível e nenhuma chamada a outro modelo.
8. Invalidar a credencial Vercel produz erro legível e nenhuma chamada Cloudflare/local.
9. Invalidar a credencial Cloudflare produz erro legível e nenhuma chamada Vercel/local.
10. Catálogo externo fora do ar remove apenas aquela origem e mostra seu estado.
11. Resposta e logs correlacionam request ID, pedido e executado; `fallback` é sempre `false`.
12. Tokens de túnel não aparecem em `ps`.
13. Conversa comum produz resposta comum sem consulta de processo nem composição LogLine.
14. Registro simples cria Act sem `process_id` e avaliação `inert`.
15. Pedido processual consulta e cita o contrato exato antes de compor.
16. O evaluator rejeita campo presente com semântica incompatível.
17. Ausência de `process_id` nunca seleciona contrato por eliminação; `if_ok` nunca escolhe processo.
18. Falha de ativação preserva `registered: true` e informa `inert`, `incompleto` ou `doubted`.
19. Dois atos na mesma fala produzem dois registros, e correção produz novo Act citando o anterior.
20. Hashes de transcrição provam que Bridge e adaptadores não alteraram system prompt, mensagens, tools ou schema.
21. Rollback da Bridge e rollback do `dm-new` foram exercitados em candidato/staging.

## 17. Fontes técnicas atuais

- Vercel AI Gateway Models & Providers: `https://vercel.com/docs/ai-gateway/models-and-providers`
- Vercel Provider Options: `https://vercel.com/docs/ai-gateway/models-and-providers/provider-options`
- Cloudflare AI Gateway REST API: `https://developers.cloudflare.com/ai-gateway/usage/rest-api/`
- Cloudflare AI Gateway API: `https://developers.cloudflare.com/api/resources/ai_gateway/`

Essas referências orientam o adaptador, mas a aceitação depende do runtime observado e dos testes de falha desta especificação.
