# Interface Protocolo — especificação

Camada humana para o runtime. O objetivo é não vazar nem uma palavra do vocabulário de
implementação, e tornar óbvias as duas únicas coisas que o usuário precisa sentir.

Contratos de endpoint em [`API.md`](API.md).

---

## 01 · Princípios

O runtime expõe hoje `if_ok`, `content_hash`, `adapter`, `danger_tier: L4`,
`evidence_obligation_unmet`. Nada disso é complexidade do domínio — é vocabulário de
implementação. Por baixo há só duas ideias.

**Nada se perde.** Tudo que chega é registrado. Sem porta, sem triagem, sem alguém
decidindo se merece entrar. O que não pôde andar fica registrado do mesmo jeito, com nome
e motivo.

**Nada anda sozinho.** Registrar é livre; andar é que tem lei. Um registro completo que
casa com um processo existente ativa. O resto espera — visível, nunca perdido.

> **A lei em uma linha:** tudo registra, só ativa o que está completo e casa com um
> processo registrado. São duas camadas separadas, e a interface nunca deve fundi-las.
> Não existe tela que decida se algo vira registro.

### Cinco regras de interação

1. **O contrato é o formulário.** Cada tipo declara o que exige (`requires`) e o que
   aceita (`accepts`). A interface gera o formulário a partir disso. Nunca se escreve
   formulário à mão.
2. **Todo erro é uma pendência com um botão.** O vocabulário de falha é fechado em 27
   códigos, cada um com frase e ação. Um "ocorreu um erro" genérico é um bug de produto.
3. **Nunca diga "pronto" sem comprovante.** O executor se recusa a fechar sem a
   comprovação declarada. A interface espelha: sem comprovante, nada de check verde.
4. **Estado é frase, não etiqueta.** Em vez de um chip escrito `doubted`, escreva
   "Registrado. Falta o motivo para andar."
5. **Atrito só na aprovação.** Todo o resto em um clique — inclusive registrar, que não
   tem clique nenhum.

---

## 02 · Léxico

Não se inventa vocabulário novo. O institucional brasileiro já está instalado na cabeça
do usuário e encaixa quase termo a termo.

| No backend | Na interface | Observação |
|---|---|---|
| register / Act | protocolar / um registro | O verbo de qualquer balcão |
| activate | andar / entrar em movimento | A camada que tem lei |
| receipt | comprovante | Sempre com data e impressão digital |
| content_hash | impressão digital | 8 caracteres. Nunca os 64 |
| doubt / doubted | pendência | "Exigência" quando falta documento |
| fechado | concluído | Só aparece com comprovante junto |
| process contract | tipo de solicitação | Exibir `title`, nunca `process_id` |
| grant + signoff | autorização assinada | Modelo mental: procuração |
| authority | quem pode assinar | Uma lista de pessoas |
| projection | extrato | Sempre rotulado como resumo |
| candidate | proposta | Registrada como tudo. Não passou pela lei de ativação |
| evidence | comprovação | O que a ação teve que provar para fechar |
| danger_tier L0–L3 | — | Não exibir |
| danger_tier L4 | "precisa de aprovação" | Reversível |
| danger_tier L5 | "não dá pra desfazer" | Irreversível |
| queue / selector / executor | — | Nunca exibir |

**Corrigir na fonte:** o vocabulário de estado do runtime é bilíngue e inconsistente —
`fechado`, `processando`, `ativável`, `incompleto` convivem com `doubted`, `queued`,
`ghost` nos mesmos campos. A interface normaliza na borda, mas o certo é padronizar no
runtime, senão cada consumidor reimplementa a tradução e eles divergem.

---

## 03 · As telas

Oito telas, cada uma com um trabalho só. Nenhuma é dashboard de métricas, e nenhuma
decide se algo vira registro.

### T0 · Conversar — *falar e já estar registrado*

A porta da frente, que não é porta. Ver §04.

### T1 · Agora — *"tem algo comigo?"*

Três perguntas, nessa ordem: **precisa de mim** (pendências + autorizações esperando),
**está andando**, **fechou hoje**. Vazio é uma resposta: "Nada esperando por você."

Nunca aparece aqui: contagem de fila, tamanho do ledger, throughput, tempo médio. Sem
tempo estimado — o sistema não promete prazo, a interface não inventa um.

`GET /api/now`

### T2 · Protocolar — *registrar por formulário*

O caminho de teclado, para quem repete a mesma solicitação. Escolhe-se o tipo numa lista
em português, e o formulário se monta de `requires` / `accepts`. Os nove slots não viram
nove campos: `who`, `did`, `this`, `when`, `confirmed_by`, `status` vêm da sessão e do
tipo; as contingências vêm do contrato.

`GET /api/process-types` → `POST /api/register`

### T3 · Pendências — *destravar o que parou*

A tela mais importante, e a que o backend mais recompensa. Cada item: **frase**
(interpolada, nunca o código), **ação** (um botão só), **quem resolve** (usuário ou
operador — 12 dos 27 códigos são configuração que o usuário não tem como resolver;
mostrar os dois igual seria crueldade), **detalhes técnicos** (recolhido, copiável).

`GET /api/pendencies`, catálogo em `GET /api/vocabulary`

### T4 · O caso — *entender o que aconteceu*

Linha do tempo vertical. Quando não anda, a linha diz o motivo em vez de sumir. As
arestas de proveniência viram links "veio de" / "gerou"; `resolves: false` nunca vira
link. É aqui que os campos compilados moram.

`GET /api/cases/{hash}`

### T5 · Aprovar — *autorizar com consciência do risco*

Único lugar com atrito deliberado. Ver §06.

### T6 · Propostas — *dar seguimento ao que foi sugerido*

Saída de modelo é registrada como proposta: está no ledger, com comprovante, como tudo.
Só não passou pela lei de ativação, porque proposta não traz processo casado. Dar
seguimento é registrar um novo ato que casa com um tipo. As fontes citadas são clicáveis
porque o runtime já conferiu que existem.

`GET /api/candidates`

### T7 · Extratos — *consultar sem confundir com a fonte*

Rótulo permanente, nunca dispensável: *"Isto é um resumo, não é a fonte. Gerado em…"* E
um botão **Refazer do zero** — deixe o usuário provar o número na frente dele.

`GET /api/projections`

---

## 04 · Ingresso por conversa

O usuário fala. Vira LogLine. Fica registrado. Se os campos casam com um processo
existente, o processo ativa junto — sem clique, sem confirmação, sem porta. A conversa
não é a antessala do registro: **a conversa é o registro**.

### 4.1 LogLine já é uma frase

A compilação não atravessa abismo semântico. Os nove slots *são* a estrutura de uma frase
declarativa com atribuição.

> **Dan** **registrou uma nota de auditoria** sobre o **balanço do Q3**, **agora**, por
> conta própria.

| Slot | Vem da frase |
|---|---|
| `who` | Dan |
| `did` | registrou uma nota de auditoria |
| `this` | balanço do Q3 |
| `when` | agora |
| `confirmed_by` | por conta própria |
| `if_ok` / `if_doubt` / `if_not` | a lei do tipo, não a frase |

As contingências pertencem ao contrato porque são a lei daquele tipo. Quem as escreve
escreve a lei, e isso acontece em outro momento, com outro ritmo.

### 4.2 Registrar é incondicional

Não existe triagem. A frase compilada entra no ledger imediatamente, completa ou não.
Depois disso, e só depois, a lei de ativação faz seu trabalho — a mesma lei para tudo,
venha de conversa, formulário ou outro processo.

| Campos casam com um tipo | Falta campo, ou não há tipo |
|---|---|
| **Registra e anda.** O processo ativa na sequência do registro. A interface reporta os dois fatos separados, porque são dois. | **Registra e espera.** Fica registrado com comprovante e aparece em Pendências dizendo o que falta. Nada perdido, nada redigitado. |

### 4.3 A tela

```
Você      preciso registrar uma auditoria no balanço do Q3, é a revisão trimestral

Protocolo [Registrado · a3f9c2d1]
          Nota de auditoria sobre o balanço do Q3, motivo revisão trimestral.
          [Já está andando]
```

Faltando informação — o registro **já aconteceu**, a conversa continua para destravar,
não para autorizar:

```
Você      preciso auditar o balanço do Q3

Protocolo [Registrado · 7b2e40c9]
          Nota de auditoria sobre o balanço do Q3.
          [Parado — falta o motivo]
          O que motivou essa auditoria?

Você      revisão trimestral

Protocolo [Registrado · c14d8f02]  [Andando]
```

**Regras de conversa:** nunca reperguntar o que já foi dito; dois pedidos numa frase
viram dois registros, nunca um; não oferecer o que não roda (`runnable: false` é dito
como fato, não proposto como opção); a impressão digital aparece sempre, discreta — é o
que dá a sensação física de que ficou registrado.

### 4.4 Correção é registro novo, não edição

O ledger é append-only, e a conversa funciona igual. Quando a pessoa corrige — *"não, é o
Q4"* — nada é reescrito: registra-se um novo LogLine citando o anterior, e é esse que
anda. O primeiro continua lá, como parte da conversa que de fato aconteceu.

Citar o ato anterior já é suportado (`lab/citation.py`). Falta uma convenção de sentido
para *"isto completa aquilo"*, para T4 desenhar a cadeia como conversa. É convenção de
campo, não mecanismo novo.

### 4.5 A forma do que sai da compilação

[`schemas/llm/process_ingress.v1.json`](../schemas/llm/process_ingress.v1.json) e
[`prompts/process_ingress.v1.txt`](../prompts/process_ingress.v1.txt) já estão no repo.

O schema não existe para desconfiar da compilação: existe porque LogLine tem forma, e
tudo que entra no ledger entra na forma — receipt de pessoa, de processo ou de modelo,
todos passam pela mesma conferência de shape e de hash.

`additionalProperties: false` mantém a compilação no seu escopo: tipo mais campos de
domínio. As contingências ficam de fora porque pertencem ao contrato — separação de
responsabilidade, do mesmo jeito que o relógio dá o `when` e a sessão dá o `who`.
`citations` registra contra qual versão do contrato a frase foi compilada: proveniência,
igual à de qualquer outro ato.

| Campo | Vem de |
|---|---|
| `who`, `confirmed_by` | sessão — a intenção é da pessoa, a autoria acompanha |
| `when` | relógio — tempo não se compila de texto |
| `did`, `this`, campos de domínio | compilação |
| `if_ok`, `if_doubt`, `if_not` | contrato |
| `grant_id` | autorização existente |

### 4.6 Quando não há tipo — propor um

A proposta é registrada como tudo mais. O que ela não faz é entrar no catálogo sozinha,
porque o catálogo é a lei, e lei entra por outro rito. Em português antes de qualquer
YAML: nome, o que passaria a exigir, o que faria, e se dá pra desfazer.

Se reaproveita uma ação existente, um operador aceita e passa a valer. Se precisa de ação
nova, o ingresso diz isso e entrega a especificação para quem desenvolve — existem quatro
ações implementadas, então essa vai ser a resposta comum, e a verdade aqui vale mais que
completar o formulário.

### 4.7 O que falta construir

| Peça | Estado |
|---|---|
| Caminho de inferência (chama modelo, confere forma e proveniência, registra) | existe |
| `process_ingress.v1.json` + prompt | **neste commit** |
| Contratos como registros no ledger (para uma compilação citar a versão da lei) | falta |
| Rota de ingresso: frase → compilação → registro | falta |
| Convenção "completa" para a cadeia de correção | falta |

Nenhuma ação nova é necessária: o ingresso é o caminho governado de inferência apontado
para um schema novo.

---

## 05 · Catálogo de pendências

Os 27 códigos vivem em [`lab/messages.py`](../lab/messages.py), servidos por
`GET /api/vocabulary`. **Renderize de lá, não hardcode.** Um teste
([`tests/test_messages.py`](../tests/test_messages.py)) trava a completude contra
`lab.runtime.DOUBT_REASONS`: adicionar uma razão no runtime sem escrever a frase quebra o
build.

Distribuição: 15 resolvidos pelo usuário, 12 pelo operador.

---

## 06 · Aprovação

A distinção reversível/irreversível é a informação mais importante da tela — mais que o
que a ação faz. Ela decide a **forma** da tela, não uma etiqueta.

| Reversível (L4) | Irreversível (L5) |
|---|---|
| Layout normal, tom calmo | Aviso no topo, não no rodapé |
| **Aprovar** + biometria | Segurar para confirmar, ou digitar o nome da ação |
| Uma confirmação | Só então a chave de segurança |
| | Sem atalho de teclado, sem aprovar em lote |

A tela mostra sempre: o que vai acontecer, quem pediu e quem autoriza, até quando vale,
limite de uso, onde pode mexer (linguagem de pasta, não caminho absoluto), o que pode
acessar na rede.

Todos esses campos já vêm de `GET /api/grants/{id}` — a tela é tradução, não coleta.

Uma autorização sem `valid_until`, `timeout_seconds`, `fs_scope` ou `network_policy`
válida registra e **nunca verifica**. Colete os quatro no formulário, ou a pessoa vai
encontrar esses códigos depois sem entender por quê.

---

## 07 · Sequência

Ordem por retorno sobre esforço, não por lógica de arquitetura.

1. **Pendências** — backend completo. Carrega sozinha a promessa "nada se perde". As 27
   frases dão o maior retorno por hora de design do produto.
2. **O caso** — leitura pura. Sem risco de escrita, valida o modelo de proveniência.
3. **Conversar** — não depende do formulário; depende do caminho de escrita e do
   catálogo. Entrada mais barata e mais completa.
4. **Protocolar** — o formulário vem depois da conversa, como conforto para quem repete.
5. **Aprovar** — por último, porque depende da superfície de autorização inteira.

T1, T6 e T7 saem quase de graça depois de T3 e T4 — são recombinações das mesmas leituras
com enquadramento diferente.

---

## 08 · Bloqueios remanescentes

Dois dos quatro bloqueios originais foram resolvidos neste commit (parser de contratos;
superfície de autorização). Restam:

- **Autenticação.** A API aceita `who` do corpo. Precisa de uma camada de sessão que
  forneça a identidade; um navegador não pode afirmar `who`.
- **Campo de contingência sobrecarregado.** `if_ok` é ao mesmo tempo "o que acontece se
  der certo" e o endereço que decide qual regra processa o registro
  (`receiver_select` filtra por `if_ok`; `select_process` resolve `process_id or if_ok`).
  Para o ingresso isso é ambíguo na hora de compilar: *próximo passo* ou *quem processa*?
  Separar antes de escrever a rota de ingresso.
- **Vocabulário de estado bilíngue** (§02).
- **`select_process` casa por eliminação.** Quando nenhum contrato bate por id, ele
  aceita o primeiro cujo `completion` passa — então um ato sem tipo casa com um contrato
  qualquer que não exige nada. É por isso que um ato sem tipo aparece como
  `no_adapter_configured` em vez de `no_matching_process_contract`. A API reporta o mesmo
  veredito que o seletor escreve, então os dois nunca divergem na tela, mas a mensagem
  não é a mais verdadeira que poderia ser.
