import type { FormalizedActProposal, ProcessContractForLLM, ProcessSearchResult } from "./process-tools";

export const DREAM_SYSTEM_PROMPT = `Converse normalmente. Não transforme toda mensagem em LogLine. Quando houver pedido de registro ou formalização, preserve a intenção na forma LogLine. Quando houver consequência ou processo desejado, consulte primeiro o contrato ativo e interprete cada campo segundo esse processo. Não invente identidade, autoridade, confirmação ou evidência. Registrar não significa ativar; somente o evaluator determina se a forma satisfez o processo.`;

export const DREAM_TOOL_DEFINITIONS = [
  { name: "search_processes", description: "Busca processos quando a pessoa deseja uma consequência governada.", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } },
  { name: "read_process_contract", description: "Lê as regras e o hash registrado de um processo antes da formalização.", parameters: { type: "object", required: ["process_id"], properties: { process_id: { type: "string" } } } },
  { name: "formalize_acts", description: "Registra uma ou mais intenções. Registro puro não traz process_id. Consequência cita o contrato lido.", parameters: { type: "object", required: ["acts"], properties: { acts: { type: "array", items: { type: "object" } } } } },
  { name: "get_case", description: "Consulta um caso existente sem criar LogLine.", parameters: { type: "object", required: ["hash"], properties: { hash: { type: "string" } } } },
  { name: "get_pendencies", description: "Consulta pendências sem criar LogLine.", parameters: { type: "object", properties: {} } },
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
  tool_choice: "auto";
};

export type DreamModelResponse = { content?: string; tool_calls?: DreamToolCall[] };

export type DreamAgentDeps = {
  model: { complete(request: DreamModelRequest): Promise<DreamModelResponse> };
  searchProcesses(query: string): Promise<ProcessSearchResult[] | Array<Record<string, unknown>>>;
  readProcessContract(processId: string): Promise<ProcessContractForLLM | Record<string, unknown>>;
  formalizeActs(acts: FormalizedActProposal[]): Promise<Array<Record<string, unknown>>>;
  getCase(hash: string): Promise<Record<string, unknown> | null>;
  getPendencies(): Promise<Record<string, unknown>>;
};

export type DreamTurn = {
  reply: string;
  conversation_id: string;
  registrations: Array<Record<string, unknown>>;
  tool_trace: Array<{ name: string; ok: boolean }>;
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

export async function runDreamTurn(
  input: { message: string; conversation_id: string; history?: DreamMessage[] },
  deps: DreamAgentDeps,
): Promise<DreamTurn> {
  const messages: DreamMessage[] = [
    { role: "system", content: DREAM_SYSTEM_PROMPT },
    ...(input.history ?? []).filter((item) => item.role !== "system"),
    { role: "user", content: input.message },
  ];
  const registrations: Array<Record<string, unknown>> = [];
  const toolTrace: Array<{ name: string; ok: boolean }> = [];
  const readContracts = new Map<string, string>();

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
      try {
        const args = object(call.arguments);
        if (call.name === "search_processes") {
          result = await deps.searchProcesses(String(args.query ?? ""));
        } else if (call.name === "read_process_contract") {
          const processId = String(args.process_id ?? "");
          result = await deps.readProcessContract(processId);
          const detail = object(result);
          const registeredHash = String(detail.registered_hash ?? "");
          if (detail.citable === true && /^[0-9a-f]{64}$/.test(registeredHash)) readContracts.set(processId, registeredHash);
        } else if (call.name === "formalize_acts") {
          const acts = Array.isArray(args.acts) ? args.acts.map((item) => object(item) as FormalizedActProposal) : [];
          if (!acts.length) throw Object.assign(new Error("formalize_acts requires at least one act"), { code: "acts_required" });
          for (const act of acts) {
            const processId = String(act.process_id ?? "");
            if (!processId) continue;
            const readHash = readContracts.get(processId);
            if (!readHash || act.contract_hash !== readHash || !(act.citations ?? []).includes(readHash)) {
              throw Object.assign(new Error(`read and cite the active contract before formalizing ${processId}`), { code: "contract_not_consulted" });
            }
          }
          const formalized = await deps.formalizeActs(acts);
          result = formalized;
          registrations.push(...formalized);
        } else if (call.name === "get_case") {
          result = await deps.getCase(String(args.hash ?? ""));
        } else if (call.name === "get_pendencies") {
          result = await deps.getPendencies();
        } else {
          throw Object.assign(new Error(`unknown Dream tool: ${call.name}`), { code: "tool_unknown" });
        }
      } catch (error) {
        ok = false;
        result = { error: processError(error) };
      }
      toolTrace.push({ name: call.name, ok });
      messages.push({
        role: "tool",
        name: call.name,
        tool_call_id: call.id,
        content: JSON.stringify({ ok, result }),
      });
    }
  }
  throw new Error("dream_tool_loop_exhausted");
}
