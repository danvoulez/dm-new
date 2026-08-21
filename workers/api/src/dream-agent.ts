import type { ActFields } from "./receipt";

export const DREAM_SYSTEM_PROMPT = `Converse normalmente. Não transforme toda mensagem em LogLine. Quando a pessoa pedir explicitamente para registrar um fato ou quando uma consequência real precisar ser solicitada, use somente as primitivas universais da Máquina de Processos: about, search e append.

about explica a gramática, identidade, tipos e vocabulário atuais. search consulta o ledger e suas projeções puras. Para qualquer consequência governada por tipo de processo, pesquise primeiro e só cite um process_id/contract_hash que apareceu no resultado verificável. append recebe a proposta inteira e exata do Act.

Ao usar append, você é o escriba/digester: componha organicamente who, did, this, when, confirmed_by, if_ok, if_doubt, if_not e status, mais qualquer AUX e um envelope explícito. Para um registro simples sem contexto adicional use envelope: {} conscientemente. who é o ator do acontecimento, não o modelo por padrão. O backend não preenche, corrige nem melhora campos semânticos ou envelope; ele verifica alegações objetivas antes de append. Não invente identidade, autoridade, confirmação, evidência, process_id ou hashes. Registrar não significa executar: consequências são derivadas somente depois do append.`;

const LOG_LINE_SLOT_NAMES = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"] as const;
const LOG_LINE_SLOT_PROPERTIES = {
  who: { type: "string", description: "Ator do acontecimento, não o LLM por default." },
  did: { type: "string" },
  this: { type: "string" },
  when: { type: "string", description: "Tempo afirmado do ato." },
  confirmed_by: { type: "string" },
  if_ok: { type: "string" },
  if_doubt: { type: "string" },
  if_not: { type: "string" },
  status: { type: "string" },
} as const;

const APPEND_ACT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: [...LOG_LINE_SLOT_NAMES, "envelope"],
  properties: {
    ...LOG_LINE_SLOT_PROPERTIES,
    envelope: {
      type: "object",
      additionalProperties: true,
      description: "Contexto explícito do Act. Use {} para o caso degenerado sem contexto.",
    },
    process_id: { type: "string", description: "Tipo de processo visto em search, quando houver consequência governada." },
    contract_hash: { type: "string", description: "Hash exato do defined_process_type visto em search." },
    citations: { type: "array", items: { type: "string" } },
  },
} as const;

export const DREAM_TOOL_DEFINITIONS = [
  {
    name: "about",
    description: "Conhece a Máquina: gramática LogLine, hashes, tipos atuais e vocabulário governado.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "search",
    description: "Busca universal no ledger, tipos de processo e vocabulário atual. Use antes de citar tipos/hashes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "append",
    description: "Propõe um Act completo, com 9 campos + AUX + envelope explícito. O kernel verifica antes de persistir.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["act"],
      properties: { act: APPEND_ACT_SCHEMA },
    },
  },
] as const;

export type DreamMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: DreamToolCall[];
};

export type DreamToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type DreamModelRequest = {
  messages: DreamMessage[];
  tools: typeof DREAM_TOOL_DEFINITIONS;
  tool_choice: "auto" | { type: "function"; function: { name: string } };
};

export type DreamModelResponse = { content?: string; tool_calls?: DreamToolCall[] };

export type DreamAgentDeps = {
  model: { complete(request: DreamModelRequest): Promise<DreamModelResponse> };
  about(): Promise<Record<string, unknown>>;
  search(query: string, limit?: number): Promise<Record<string, unknown>>;
  append(act: ActFields): Promise<Record<string, unknown>>;
};

export type DreamTurn = {
  reply: string;
  conversation_id: string;
  registrations: Array<Record<string, unknown>>;
  tool_trace: Array<{ name: string; ok: boolean; code?: string }>;
};

export type DreamTrustedContext = {
  identity?: string;
  now?: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function processError(error: unknown): Record<string, unknown> {
  const candidate = error as { code?: unknown; message?: unknown; detail?: unknown };
  return {
    code: typeof candidate?.code === "string" ? candidate.code : "tool_failed",
    message: error instanceof Error ? error.message : String(error),
    ...(candidate?.detail && typeof candidate.detail === "object" ? { detail: candidate.detail } : {}),
  };
}

function trustedContextMessage(context: DreamTrustedContext | undefined): DreamMessage | null {
  if (!context) return null;
  const identity = String(context.identity ?? "").trim();
  const now = String(context.now ?? "").trim();
  if (!identity && !now) return null;
  return {
    role: "system",
    content: `Contexto objetivo da borda (não é uma LogLine pronta e não autoriza inventar outros valores): ${JSON.stringify({ authenticated_identity: identity || null, current_time: now || null })}`,
  };
}

function collectHashes(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    if (/^[0-9a-f]{64}$/.test(value)) into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHashes(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectHashes(item, into);
  }
}

function registrationReply(registrations: Array<Record<string, unknown>>): string {
  const lines = registrations.map((registration) => {
    const id = String(registration.id ?? registration.content_hash ?? "");
    const fingerprint = String(registration.fingerprint ?? (id.slice(0, 8) || "sem-recibo"));
    const processId = String(registration.process_id ?? "").trim();
    const activated = registration.activated === true;
    const queued = registration.queued === true;
    const waiting = object(registration.waiting);
    const waitingMessage = String(waiting.message ?? "").trim();

    if (!processId) return `Registrado · Recibo ${fingerprint} · Apenas registrado; nenhuma ativação foi solicitada.`;
    if (activated && queued) return `Registrado · Recibo ${fingerprint} · Ativável e encaminhado para execução.`;
    if (activated) return `Registrado · Recibo ${fingerprint} · Ativável; ainda não encaminhado.`;
    return `Registrado · Recibo ${fingerprint} · Não ativado${waitingMessage ? `: ${waitingMessage}` : "."}`;
  });
  return lines.length === 1 ? lines[0] : `Registros concluídos:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export async function runDreamTurn(
  input: { message: string; conversation_id: string; history?: DreamMessage[]; trusted_context?: DreamTrustedContext },
  deps: DreamAgentDeps,
): Promise<DreamTurn> {
  const trusted = trustedContextMessage(input.trusted_context);
  const messages: DreamMessage[] = [
    { role: "system", content: DREAM_SYSTEM_PROMPT },
    ...(trusted ? [trusted] : []),
    ...(input.history ?? []).filter((item) => item.role !== "system"),
    { role: "user", content: input.message },
  ];
  const registrations: Array<Record<string, unknown>> = [];
  const toolTrace: Array<{ name: string; ok: boolean; code?: string }> = [];
  const searchedHashes = new Set<string>();
  let searchObserved = false;

  for (let turn = 0; turn < 10; turn += 1) {
    const response = await deps.model.complete({ messages, tools: DREAM_TOOL_DEFINITIONS, tool_choice: "auto" });
    const calls = Array.isArray(response.tool_calls) ? response.tool_calls : [];
    if (!calls.length) {
      const reply = String(response.content ?? "").trim();
      if (!reply) throw new Error("llm_empty_reply");
      return { reply, conversation_id: input.conversation_id, registrations, tool_trace: toolTrace };
    }
    messages.push({ role: "assistant", content: String(response.content ?? ""), tool_calls: calls });

    for (const call of calls) {
      let result: unknown;
      let ok = true;
      let failureCode: string | undefined;
      try {
        const args = object(call.arguments);
        if (call.name === "about") {
          result = await deps.about();
        } else if (call.name === "search") {
          const query = String(args.query ?? "");
          const limit = typeof args.limit === "number" ? args.limit : undefined;
          result = await deps.search(query, limit);
          searchObserved = true;
          collectHashes(result, searchedHashes);
        } else if (call.name === "append") {
          const act = object(args.act) as ActFields;
          if (!Object.keys(act).length) throw Object.assign(new Error("append requires a complete act"), { code: "act_required" });
          if (!("envelope" in act) || !act.envelope || typeof act.envelope !== "object" || Array.isArray(act.envelope)) {
            throw Object.assign(new Error("append Act must carry an explicit envelope object"), { code: "envelope_required" });
          }
          const processId = String(act.process_id ?? "").trim();
          if (processId) {
            const contractHash = String(act.contract_hash ?? "").trim();
            const citations = Array.isArray(act.citations) ? act.citations : [];
            if (!searchObserved) {
              throw Object.assign(new Error("search the ledger before appending a process-bound Act"), { code: "search_required_for_process" });
            }
            if (!/^[0-9a-f]{64}$/.test(contractHash) || !searchedHashes.has(contractHash) || !citations.includes(contractHash)) {
              throw Object.assign(new Error("process-bound append must cite the exact type hash returned by search"), { code: "process_type_not_consulted" });
            }
          }
          result = await deps.append(act);
          registrations.push(object(result));
        } else {
          throw Object.assign(new Error(`unknown Dream tool: ${call.name}`), { code: "tool_unknown" });
        }
      } catch (error) {
        ok = false;
        const failure = processError(error);
        failureCode = String(failure.code);
        result = { error: failure };
      }
      toolTrace.push({ name: call.name, ok, ...(failureCode ? { code: failureCode } : {}) });
      messages.push({
        role: "tool",
        name: call.name,
        tool_call_id: call.id,
        content: JSON.stringify({ ok, result }),
      });
    }
    if (registrations.length) {
      return {
        reply: registrationReply(registrations),
        conversation_id: input.conversation_id,
        registrations,
        tool_trace: toolTrace,
      };
    }
  }
  throw new Error("dream_tool_loop_exhausted");
}
