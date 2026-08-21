# Interface Protocolo — especificação v1.2

Camada humana para o runtime canônico do Worker.

A interface deve tornar simples o que é simples para a pessoa sem apagar as invariantes do
sistema por baixo.

Contrato HTTP em [`API.md`](API.md).

---

## 01 · Princípios

### Nada some

Um Act objetivamente válido pode existir mesmo que não dispare processo nenhum. A interface
não inventa movimento para justificar a existência do registro.

### Nada anda antes de ser verificado e registrado

A ordem é fixa:

```text
proposta -> verificar -> registrar no ledger -> rotear/avaliar -> produzir efeito
```

Se a proposta é inválida, falha antes do append. Se foi registrada e o passo seguinte
falhou, a interface não finge que o registro desapareceu.

### A interface não é coautora silenciosa

Quem produz a proposta completa os nove slots LogLine mais AUX e envelope. O backend
confere fatos objetivos e invariantes; não preenche semântica ausente para “ajudar”.

### Ator não é escriba

`who` descreve o ator da proposição. A identidade autenticada de quem digitou, chamou a
API ou operou o modelo é outro fato. Não misture os dois na interface.

---

## 02 · Léxico humano

| Runtime | Interface |
|---|---|
| Act / append | protocolar / registro |
| receipt | comprovante |
| content_hash | identidade do conteúdo |
| tuple_hash | ocorrência / comprovante específico |
| opened_process | início do processo |
| process instance | processo / caso |
| responsible | com quem está |
| custody | trabalho atual |
| doubt | pendência |
| evidence | comprovação |
| grant + signoff | autorização assinada |
| projection | extrato / resumo |
| candidate | proposta |

Nunca mostre `runtime_queue`, `selector`, `executor`, `tuple_hash`, `if_ok` ou outras
palavras de implementação como se fossem linguagem institucional comum. Elas podem existir
num painel técnico copiável, não como frase principal da tela.

---

## 03 · Identidade e comprovante

Receipt v1 separa três coisas:

```text
content_hash  = identidade semântica
envelope_hash = identidade do contexto/ancestralidade
tuple_hash    = ocorrência concreta no ledger
```

Para uma pessoa, o comprovante mostrado deve ser curto e copiável, mas o detalhe técnico
precisa preservar o hash completo quando necessário.

Em processos, o `content_hash` do `opened_process` é a identidade permanente da instância.
Os atos seguintes pertencem ao caso por `envelope.process` e formam a corrente por
`envelope.parent`.

---

## 04 · Telas

### T0 · Conversar

A conversa serve para produzir propostas completas e explicáveis.

O modelo trabalha apenas com:

```text
about
search
append
```

A conversa deve distinguir claramente:

1. proposta ainda não submetida;
2. proposta recusada antes do append;
3. Act registrado;
4. Act registrado que abriu/moveu um processo;
5. Act registrado que não acionou nada.

Nunca transformar “não acionou nada” em erro genérico.

### T1 · Agora

`GET /api/now`

Responder quatro perguntas práticas:

- precisa de mim?
- precisa de operador?
- o que está andando?
- o que fechou recentemente?

Essas respostas vêm de replay do processo + custody atual. Contagem de fila legada não é
verdade de produto.

### T2 · Protocolar

`GET /api/process-types` → `POST /api/append`

O formulário pode ser guiado pelo tipo de processo, mas a proposta final precisa conter os
nove slots LogLine completos, AUX e envelope.

Não existe preenchimento invisível pelo backend das contingências `if_ok`, `if_doubt` e
`if_not`. Se a interface as deriva de uma definição escolhida, isso acontece no lado de
autoria e a proposta enviada já chega completa.

### T3 · Pendências

`GET /api/pendencies`

Cada item mostra:

- frase humana do que está esperando;
- quem é o responsável atual;
- uma ação principal;
- detalhe técnico opcional;
- link para o caso.

Custody antiga que não corresponde mais ao head atual não deve aparecer como pendência
vigente.

### T4 · O caso

`GET /api/cases/{hash}`

Linha do tempo derivada do ledger.

Para processo canônico:

- começa no `opened_process`;
- segue os Acts ligados à instância;
- mostra o nó atual e o responsável atual;
- preserva a cadeia de ocorrências;
- não depende de blob mutável de estado.

### T5 · Aprovar

Único lugar com atrito deliberado.

Aprovação não é um atalho para o modelo, router ou executor. Trabalho perigoso só pode
produzir efeito quando grant, signoff e demais condições de segurança estiverem válidas no
momento da execução.

### T6 · Propostas

`GET /api/candidates`

Proposta não é autoridade. Aprovar visualmente uma sugestão significa produzir um novo Act
ou executar o rito de controle apropriado — nunca transformar o candidato anterior em
ordem mutável.

### T7 · Extratos

`GET /api/projections`

Rótulo permanente:

> Isto é um resumo reconstruível. Não é a fonte.

---

## 05 · Processos

### Abertura

Um processo nasce com `opened_process`.

A interface pode dizer:

> Processo aberto · comprovante ab12cd34

Não precisa mostrar o hash de 64 caracteres no fluxo principal.

### Movimento

O resultado de dispatch é sempre um de:

```text
ok | doubt | not
```

A interface traduz o efeito institucional; não inventa um quarto estado.

### Responsabilidade

O responsável atual vem do nó canônico do processo.

Pode ser pessoa, equipe ou `runtime.executor`. Claims/leases são coordenação interna e não
devem aparecer como mudança de responsabilidade institucional.

### Encerramento

Processo fechado é projeção do ledger, não linha mutável numa tabela de casos.

---

## 06 · Conversa e autoria

### O modelo não recebe lei escondida do backend

No boundary Dream, o modelo escreve todos os nove slots mais AUX e envelope. Isso inclui as
contingências.

O backend pode oferecer contexto via `about` e `search`; pode rejeitar uma proposta
objetivamente inválida; não pode completar semântica omitida em silêncio.

### Correção é novo Act

O ledger é append-only.

Se a pessoa corrige algo, a interface produz outro Act com a proveniência adequada. Não
edita o anterior para fazer a história parecer limpa.

### Dois pedidos são dois Acts

Não compactar semanticamente pedidos distintos em um único registro só para simplificar a
UI.

---

## 07 · Falha

A interface deve separar:

### Falhou antes de registrar

Exemplos:

- shape inválido;
- slot ausente;
- envelope impossível;
- parent incorreto;
- claim objetivo falso.

Mensagem principal: **não foi protocolado**.

### Registrou, mas não moveu

É um fato válido. Pode ser um free tuple ou um Act sem consequência processual.

Mensagem principal: **protocolado; sem movimento automático**.

### Registrou, mas o runtime seguinte falhou

O comprovante continua válido. A pessoa não deve reenviar cegamente e criar duplicata.

Mensagem principal: **protocolado; movimento indisponível** + comprovante.

### Efeito recusado

Grant, signoff, atividade desconhecida, evidência ausente ou custody obsoleta devem falhar
alto. Nunca transformar em “concluído” para deixar a interface verde.

---

## 08 · Compatibilidade

O repositório ainda contém superfícies antigas para migração e histórico:

- `lab/api.py` com `/api/register`;
- `runtime_queue`;
- `process_contracts`;
- vocabulário antigo de selector/evaluator;
- documentos históricos e planos com `sent_to` / `next_if_*`.

Essas superfícies não definem o comportamento canônico da interface nova.

A UI de produção deve usar o Worker e `POST /api/append`.

---

## 09 · Regra de produto em uma linha

> **A autoria é explícita, a verificação vem antes do ledger, o ledger vem antes da
> consequência, e todo estado visível deve poder ser explicado a partir dos Acts.**
