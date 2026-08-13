export type ChatRisk = "none" | "approval" | "irreversible";

export type ChatAction =
  | { kind: "confirm_register"; summary: string; fields: Record<string, string>; missing: string[]; risk: ChatRisk; register_body: Record<string, unknown> }
  | { kind: "confirm_new_type"; summary: string; contract_draft: Record<string, unknown> }
  | { kind: "confirm_grant"; summary: string; grant_draft: Record<string, unknown> }
  | { kind: "request_passkey"; summary: string; grant_id: string; sign_options: Record<string, unknown> }
  | { kind: "status"; summary: string; case_hash?: string }
  | { kind: "clarify"; question: string };

export type ChatTurn = {
  reply: string;
  conversation_id: string;
  action?: ChatAction;
};


export function validateChatTurn(value: ChatTurn): ChatTurn {
  if (!value || typeof value !== "object") throw new Error("chat_turn_invalid");
  if (typeof value.reply !== "string" || !value.reply.trim()) throw new Error("chat_turn_reply_invalid");
  if (typeof value.conversation_id !== "string" || !value.conversation_id.trim()) throw new Error("chat_turn_conversation_invalid");
  const action = value.action;
  if (!action) return value;

  const nonEmpty = (input: unknown): input is string => typeof input === "string" && input.trim().length > 0;
  const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === "object" && !Array.isArray(input);
  const stringRecord = (input: unknown): input is Record<string, string> =>
    record(input) && Object.values(input).every((item) => typeof item === "string");
  const stringArray = (input: unknown): input is string[] => Array.isArray(input) && input.every((item) => typeof item === "string");
  const exactKeys = (input: Record<string, unknown>, allowed: string[]) => Object.keys(input).every((key) => allowed.includes(key));

  const raw = action as unknown as Record<string, unknown>;
  switch (action.kind) {
    case "confirm_register":
      if (!exactKeys(raw, ["kind", "summary", "fields", "missing", "risk", "register_body"]) ||
          !nonEmpty(action.summary) || !stringRecord(action.fields) || !stringArray(action.missing) ||
          !["none", "approval", "irreversible"].includes(action.risk) || !record(action.register_body)) {
        throw new Error("chat_turn_action_invalid:confirm_register");
      }
      break;
    case "confirm_new_type":
      if (!exactKeys(raw, ["kind", "summary", "contract_draft"]) || !nonEmpty(action.summary) || !record(action.contract_draft))
        throw new Error("chat_turn_action_invalid:confirm_new_type");
      break;
    case "confirm_grant":
      if (!exactKeys(raw, ["kind", "summary", "grant_draft"]) || !nonEmpty(action.summary) || !record(action.grant_draft))
        throw new Error("chat_turn_action_invalid:confirm_grant");
      break;
    case "request_passkey":
      if (!exactKeys(raw, ["kind", "summary", "grant_id", "sign_options"]) || !nonEmpty(action.summary) ||
          !/^[0-9a-f]{64}$/.test(action.grant_id) || !record(action.sign_options))
        throw new Error("chat_turn_action_invalid:request_passkey");
      break;
    case "status":
      if (!exactKeys(raw, ["kind", "summary", "case_hash"]) || !nonEmpty(action.summary) ||
          (action.case_hash !== undefined && !/^[0-9a-f]{64}$/.test(action.case_hash)))
        throw new Error("chat_turn_action_invalid:status");
      break;
    case "clarify":
      if (!exactKeys(raw, ["kind", "question"]) || !nonEmpty(action.question))
        throw new Error("chat_turn_action_invalid:clarify");
      break;
    default:
      throw new Error("chat_turn_action_invalid:unknown");
  }
  return value;
}

export const PLANNER_TOOLS = [
  "register",
  "get_case",
  "get_pendencies",
  "explain_stop",
  "draft_type",
  "draft_grant",
  "request_passkey",
  "build_projection",
  "clarify",
] as const;

export type PlannerTool = (typeof PLANNER_TOOLS)[number];
export type PlannerCall = { name: PlannerTool; arguments: Record<string, unknown> };

export function riskFromTier(tier: string): ChatRisk {
  if (tier === "L5") return "irreversible";
  if (tier === "L3" || tier === "L4") return "approval";
  return "none";
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("llm_json_missing");
  return JSON.parse(trimmed.slice(first, last + 1));
}

export function parsePlannerCall(text: string): PlannerCall {
  const parsed = extractJsonObject(text) as { tool_call?: { name?: unknown; arguments?: unknown }; name?: unknown; arguments?: unknown };
  const candidate = parsed?.tool_call ?? parsed;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  if (!(PLANNER_TOOLS as readonly string[]).includes(name)) throw new Error("llm_tool_invalid");
  const args = candidate?.arguments;
  return {
    name: name as PlannerTool,
    arguments: args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {},
  };
}

function fallbackFor(action?: ChatAction): string {
  if (!action) return "Entendi. Posso continuar a partir daqui.";
  switch (action.kind) {
    case "confirm_register": return action.missing.length ? `Entendi o pedido. Ainda preciso de ${action.missing.join(" e ")}.` : action.summary;
    case "confirm_new_type": return action.summary;
    case "confirm_grant": return action.summary;
    case "request_passkey": return "A autorização está pronta para ser assinada com sua passkey.";
    case "status": return action.summary;
    case "clarify": return action.question;
  }
}

/** Keep implementation identifiers, hashes and serialized objects out of the human reply. */
export function safeHumanReply(reply: unknown, action?: ChatAction): string {
  const value = typeof reply === "string" ? reply.trim() : "";
  if (!value) return fallbackFor(action);
  const leaksTechnical = /\b(process_id|danger_tier|readiness|grant_id|content_hash|tuple_hash|L[0-5])\b/i.test(value)
    || /\b[0-9a-f]{64}\b/i.test(value)
    || /```/.test(value)
    || /^\s*[\[{]/.test(value);
  if (leaksTechnical) return fallbackFor(action);
  return value.slice(0, 2000);
}

export function valueWasSupplied(value: string, evidenceText: string): boolean {
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return false;
  return evidenceText.toLocaleLowerCase().includes(needle);
}
