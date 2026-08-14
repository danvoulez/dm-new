import type { PgClient } from "./db";
import { appendAct } from "./db";
import { loadContracts } from "./contracts";
import { evaluate } from "./evaluator";
import { registerFlow, registerResponse } from "./register-flow";
import { caseView, pendenciesView, receiverSelect } from "./runtime";
import {
  DREAM_TOOL_DEFINITIONS,
  runDreamTurn,
  type DreamMessage,
  type DreamModelRequest,
  type DreamModelResponse,
} from "./dream-agent";
import {
  assembleAct,
  readProcessContract,
  searchProcesses,
  type FormalizedActProposal,
} from "./process-tools";
import type { WebAuthnEnv } from "./webauthn";
import { fetchModelCatalog, goldenBridgeFetch, requireExplicitCatalogModel } from "./model-catalog";

export type ChatEnv = WebAuthnEnv & {
  GOLDEN_BRIDGE_URL?: string;
  GOLDEN_BRIDGE_ACCESS_ID?: string;
  GOLDEN_BRIDGE_ACCESS_SECRET?: string;
};

type ConversationRow = { role: "user" | "assistant"; message: string; created_at: string };

class BridgeCompletionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BridgeCompletionError";
    this.status = status;
    this.code = code;
  }
}

function upstreamMessages(messages: DreamMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "assistant" && message.tool_calls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.tool_call_id,
        ...(message.name ? { name: message.name } : {}),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    throw new Error("llm_tool_arguments_invalid");
  }
}

function bridgeModel(env: ChatEnv, model: string) {
  return {
    async complete(request: DreamModelRequest): Promise<DreamModelResponse> {
      const response = await goldenBridgeFetch(env, "/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model,
          messages: upstreamMessages(request.messages),
          tools: DREAM_TOOL_DEFINITIONS.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
          tool_choice: request.tool_choice,
          temperature: 0,
          max_tokens: 900,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } | string } | null;
        const nested = body?.error && typeof body.error === "object" ? body.error : null;
        throw new BridgeCompletionError(
          response.status,
          nested?.code ?? "model_unavailable",
          nested?.message ?? `Golden Bridge completion failed with HTTP ${response.status}`,
        );
      }
      const body = await response.json() as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> } }>;
      };
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error("llm_empty_reply");
      return {
        content: message.content ?? undefined,
        tool_calls: (message.tool_calls ?? []).map((call) => ({
          id: String(call.id ?? crypto.randomUUID()),
          name: String(call.function?.name ?? ""),
          arguments: parseToolArguments(call.function?.arguments),
        })),
      };
    },
  };
}

async function loadHistory(db: D1Database, conversationId: string): Promise<DreamMessage[]> {
  const result = await db.prepare(
    "SELECT role,message,created_at FROM chat_turns WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 12",
  ).bind(conversationId).all();
  return (result.results as unknown as ConversationRow[]).reverse().map((row) => ({ role: row.role, content: row.message }));
}

async function storeConversationPair(
  db: D1Database,
  conversationId: string,
  userMessage: string,
  reply: string,
  registrations: Array<Record<string, unknown>>,
): Promise<void> {
  const base = Date.now();
  await db.prepare("INSERT INTO chat_turns(id,conversation_id,role,message,action_json,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), conversationId, "user", userMessage, null, new Date(base).toISOString())
    .run();
  await db.prepare("INSERT INTO chat_turns(id,conversation_id,role,message,action_json,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), conversationId, "assistant", reply, registrations.length ? JSON.stringify({ registrations }) : null, new Date(base + 1).toISOString())
    .run();
}

export async function runChatTurn(
  env: ChatEnv,
  client: PgClient,
  input: { message: string; conversation_id?: string; model?: string; identity?: string },
) {
  const model = String(input.model ?? "").trim();
  if (!model) throw Object.assign(new Error("Escolha um modelo da Golden Bridge antes de enviar."), { code: "model_required", status: 400 });
  const catalog = await fetchModelCatalog(env);
  const selectedModel = requireExplicitCatalogModel(catalog, model);
  const conversationId = input.conversation_id || crypto.randomUUID();
  const history = await loadHistory(env.PROJECTIONS, conversationId);
  const identity = String(input.identity ?? "").trim();

  const result = await runDreamTurn({ message: input.message, conversation_id: conversationId, history }, {
    model: bridgeModel(env, selectedModel.id),
    searchProcesses: (query) => searchProcesses(client, query),
    readProcessContract: (processId) => readProcessContract(client, processId),
    formalizeActs: async (proposals: FormalizedActProposal[]) => {
      const catalog = await loadContracts(client);
      const outcomes: Array<Record<string, unknown>> = [];
      for (const proposal of proposals) {
        const processId = String(proposal.process_id ?? "");
        const fields = assembleAct(proposal, {
          session: { who: identity, confirmed_by: identity },
          clock: { when: new Date().toISOString() },
          evidence: {},
        }, processId ? catalog.get(processId) : undefined);
        const outcome = await registerFlow(client, fields, {
          append: appendAct,
          loadCatalog: loadContracts,
          evaluateReceipt: evaluate,
          selectReceiver: receiverSelect,
        });
        outcomes.push(registerResponse(outcome));
      }
      return outcomes;
    },
    getCase: (hash) => caseView(client, hash),
    getPendencies: () => pendenciesView(client, undefined, 20),
  });
  await storeConversationPair(env.PROJECTIONS, conversationId, input.message, result.reply, result.registrations);
  return result;
}
