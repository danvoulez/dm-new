import type { PgClient } from "./db";
import { caseView, nowView, pendenciesView } from "./runtime";
import { renderMessage } from "./messages";
import { humanProcessTitle, loadContracts, toProcessTypeView, type ProcessContract } from "./contracts";
import { listGrants, validateGrantInput, type GrantInput } from "./grants";
import { createSignOptions, type WebAuthnEnv } from "./webauthn";
import { CATALOG } from "./vocabulary";
import {
  extractJsonObject,
  parsePlannerCall,
  riskFromTier,
  safeHumanReply,
  valueWasSupplied,
  type ChatAction,
  type ChatTurn,
  type PlannerCall,
  validateChatTurn,
} from "./chat-core";

export type ChatEnv = WebAuthnEnv & {
  GOLDEN_BRIDGE_URL?: string;
  GOLDEN_BRIDGE_ACCESS_ID?: string;
  GOLDEN_BRIDGE_ACCESS_SECRET?: string;
  GOLDEN_BRIDGE_TUNNEL_ID?: string;
};

type ConversationRow = { role: "user" | "assistant"; message: string; action_json?: string | null; created_at: string };
type ModelInfo = { id?: string; provider?: string; owned_by?: string };

type ToolResult = {
  action: ChatAction;
  facts: Record<string, unknown>;
};

const BRIDGE_DEFAULT = "https://inference.minilab.work";
const CORE_INPUT_FIELDS = new Set(["who", "this", "confirmed_by", "grant_id"]);
const HUMAN_FIELD_LABELS: Record<string, string> = {
  who: "quem está registrando",
  this: "o que está sendo registrado",
  confirmed_by: "quem confirma",
  grant_id: "a autorização",
};

async function bridgeFetch(env: ChatEnv, path: string, init: RequestInit = {}): Promise<Response> {
  const publicBase = (env.GOLDEN_BRIDGE_URL ?? BRIDGE_DEFAULT).replace(/\/+$/, "");
  const host = new URL(publicBase).host;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) };
  if (env.GOLDEN_BRIDGE_TUNNEL_ID) {
    const response = await fetch(`https://${env.GOLDEN_BRIDGE_TUNNEL_ID}.cfargotunnel.com${path}`, {
      ...init,
      headers: { ...headers, Host: host },
    });
    if (response.ok) return response;
  }
  if (env.GOLDEN_BRIDGE_ACCESS_ID && env.GOLDEN_BRIDGE_ACCESS_SECRET) {
    headers["CF-Access-Client-Id"] = env.GOLDEN_BRIDGE_ACCESS_ID;
    headers["CF-Access-Client-Secret"] = env.GOLDEN_BRIDGE_ACCESS_SECRET;
  }
  return fetch(`${publicBase}${path}`, { ...init, headers });
}

async function availableModels(env: ChatEnv): Promise<ModelInfo[]> {
  const response = await bridgeFetch(env, "/v1/models");
  if (!response.ok) throw new Error(`model_catalog_unavailable:${response.status}`);
  const body = await response.json() as { data?: ModelInfo[] };
  return Array.isArray(body.data) ? body.data : [];
}

function selectModel(models: ModelInfo[], requested?: string): string {
  const ids = models.map((item) => String(item.id ?? "")).filter(Boolean);
  if (requested && ids.includes(requested)) return requested;
  return ids.find((id) => /mistral-nemo/i.test(id)) ?? ids[0] ?? requested ?? "mistral-nemo-q4";
}

async function completeJson(env: ChatEnv, model: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, maxTokens = 700): Promise<string> {
  const response = await bridgeFetch(env, "/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens }),
  });
  if (!response.ok) throw new Error(`golden_bridge_unavailable:${response.status}:${(await response.text()).slice(0, 200)}`);
  const completion = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("llm_empty_reply");
  return text;
}

async function loadHistory(db: D1Database, conversationId: string): Promise<ConversationRow[]> {
  const result = await db.prepare(
    "SELECT role,message,action_json,created_at FROM chat_turns WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 12",
  ).bind(conversationId).all();
  return (result.results as unknown as ConversationRow[]).reverse();
}

async function storeConversationPair(db: D1Database, conversationId: string, userMessage: string, reply: string, action?: ChatAction): Promise<void> {
  const base = Date.now();
  await db.prepare("INSERT INTO chat_turns(id,conversation_id,role,message,action_json,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), conversationId, "user", userMessage, null, new Date(base).toISOString())
    .run();
  await db.prepare("INSERT INTO chat_turns(id,conversation_id,role,message,action_json,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), conversationId, "assistant", reply, action ? JSON.stringify(action) : null, new Date(base + 1).toISOString())
    .run();
}

function historyForPlanner(history: ConversationRow[]): string {
  if (!history.length) return "(conversa nova)";
  return history.map((row) => {
    const action = row.action_json ? `\n[ação interna anterior: ${row.action_json}]` : "";
    return `${row.role === "user" ? "USUÁRIO" : "ASSISTENTE"}: ${row.message}${action}`;
  }).join("\n");
}

function processLabel(contract: ProcessContract): string {
  return humanProcessTitle(contract.process_id, contract.title);
}

function fieldLabel(key: string): string {
  return HUMAN_FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw == null) continue;
    const item = String(raw).trim();
    if (item) out[key] = item.slice(0, 1000);
  }
  return out;
}

function stringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function humanSummary(label: string, fields: Record<string, string>): string {
  const values = Object.entries(fields)
    .filter(([key]) => !["who", "confirmed_by", "grant_id"].includes(key))
    .slice(0, 4)
    .map(([key, value]) => `${fieldLabel(key)}: ${value}`);
  return values.length ? `${label} · ${values.join(" · ")}` : label;
}

async function resolveCaseHash(client: PgClient, raw: string): Promise<string | null> {
  const value = raw.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(value)) return value;
  if (!/^[0-9a-f]{6,63}$/.test(value)) return null;
  const result = await client.query<{ content_hash: string }>(
    "SELECT content_hash FROM public.logline_acts WHERE content_hash LIKE $1 ORDER BY inserted_at DESC LIMIT 2",
    [`${value}%`],
  );
  return result.rows.length === 1 ? result.rows[0].content_hash : null;
}

function plannerPrompt(params: {
  message: string;
  history: ConversationRow[];
  catalog: ReturnType<typeof toProcessTypeView>[];
  now: Awaited<ReturnType<typeof nowView>>;
  grants: Awaited<ReturnType<typeof listGrants>>;
  models: ModelInfo[];
}): string {
  const vocabulary = Object.entries(CATALOG).map(([code, [template, action, resolvedBy]]) => ({ code, template, action, resolved_by: resolvedBy }));
  return `Você é o planner do Dream. Escolha EXATAMENTE UMA ferramenta. Você nunca escreve no ledger e nunca assina autorização. O Worker valida todos os argumentos.\n\n` +
    `FERRAMENTAS:\n` +
    `register {process_id, fields}: preparar uma confirmação de registro. fields pode conter apenas dados realmente ditos pelo usuário. Nunca invente who ou confirmed_by.\n` +
    `get_case {case_hash}: consultar andamento por hash/fingerprint mencionado.\n` +
    `get_pendencies {resolved_by?}: consultar pendências.\n` +
    `explain_stop {reason}: explicar uma parada usando apenas o catálogo.\n` +
    `draft_type {title, requires[], accepts[], danger_tier?, description?}: propor novo tipo.\n` +
    `draft_grant {process, granted_by, granted_to, adapter?, valid_until, acu_limit?, timeout_seconds, fs_scope, network_policy}: propor autorização.\n` +
    `request_passkey {identity, grant_id}: pedir assinatura de grant já criado.\n` +
    `build_projection {spec}: pedir/consultar uma projeção reconstruível.\n` +
    `clarify {question}: quando falta informação ou a confiança é baixa.\n\n` +
    `CATÁLOGO INTERNO: ${JSON.stringify(params.catalog)}\n` +
    `VOCABULÁRIO FECHADO: ${JSON.stringify(vocabulary)}\n` +
    `AGORA: ${JSON.stringify(params.now)}\n` +
    `GRANTS: ${JSON.stringify(params.grants)}\n` +
    `MODELOS: ${JSON.stringify(params.models)}\n\n` +
    `CONVERSA ANTERIOR:\n${historyForPlanner(params.history)}\n\n` +
    `MENSAGEM ATUAL: ${params.message}\n\n` +
    `Responda SOMENTE JSON: {"tool_call":{"name":"<ferramenta>","arguments":{...}}}. ` +
    `Uma ferramenta por turno. Para fatos do ledger use get_case/get_pendencies, não chute. Para parada use explain_stop. ` +
    `Tipo contract-only/not-runnable não deve ser oferecido como executável.`;
}

async function executeTool(
  env: ChatEnv,
  client: PgClient,
  call: PlannerCall,
  message: string,
  history: ConversationRow[],
): Promise<ToolResult> {
  const catalog = await loadContracts(client);
  const evidenceText = [...history.filter((row) => row.role === "user").map((row) => row.message), message].join("\n");

  if (call.name === "clarify") {
    const question = String(call.arguments.question ?? "").trim().slice(0, 500) || "O que você quer que eu faça com isso?";
    return { action: { kind: "clarify", question }, facts: { clarification: question } };
  }

  if (call.name === "get_pendencies") {
    const resolvedBy = String(call.arguments.resolved_by ?? "").trim();
    const filter = resolvedBy === "user" || resolvedBy === "operator" ? resolvedBy : undefined;
    const result = await pendenciesView(client, filter, 20);
    const summary = result.count === 0 ? "Não há pendências nesse recorte." : result.count === 1 ? "Há 1 pendência nesse recorte." : `Há ${result.count} pendências nesse recorte.`;
    return { action: { kind: "status", summary }, facts: { pendencies: result.pendencies } };
  }

  if (call.name === "get_case") {
    const raw = String(call.arguments.case_hash ?? "").trim();
    const hash = await resolveCaseHash(client, raw);
    if (!hash) return { action: { kind: "clarify", question: "Qual processo você quer consultar? Pode me passar o identificador curto mostrado na interface." }, facts: { case_found: false } };
    const detail = await caseView(client, hash);
    if (!detail) return { action: { kind: "status", summary: "Não encontrei esse processo." }, facts: { case_found: false } };
    const latest = detail.timeline.at(-1);
    const summary = latest?.label ? `O processo está em: ${latest.label}.` : "Encontrei o processo.";
    return { action: { kind: "status", summary, case_hash: hash }, facts: { case: detail } };
  }

  if (call.name === "explain_stop") {
    const reason = String(call.arguments.reason ?? "").trim();
    if (!(reason in CATALOG)) {
      return { action: { kind: "clarify", question: "Qual parada ou pendência você quer que eu explique?" }, facts: { reason_known: false } };
    }
    const rendered = renderMessage(reason, call.arguments);
    return { action: { kind: "status", summary: `${rendered.message} ${rendered.action}.` }, facts: rendered };
  }

  if (call.name === "register") {
    const processId = String(call.arguments.process_id ?? "").trim();
    const contract = catalog.get(processId);
    if (!contract) return { action: { kind: "clarify", question: "Não encontrei um tipo de processo confiável para esse pedido. Quer descrever o resultado que você precisa?" }, facts: { process_match: false } };
    const view = toProcessTypeView(contract);
    const label = processLabel(contract);
    if (!view.runnable) {
      return {
        action: { kind: "clarify", question: `“${label}” existe, mas ainda não executa. Quer registrar isso como memória ou avisar o operador?` },
        facts: { process_match: true, readiness: view.readiness, readiness_reason: view.readiness_reason },
      };
    }
    const proposed = stringRecord(call.arguments.fields);
    const allowedAux = new Set([...(contract.must_include ?? []), ...(contract.optional_aux ?? [])]);
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(proposed)) {
      if (!allowedAux.has(key) && !CORE_INPUT_FIELDS.has(key)) continue;
      if ((key === "who" || key === "confirmed_by") && !valueWasSupplied(value, evidenceText)) continue;
      fields[key] = value;
    }
    const body: Record<string, unknown> = {
      ...fields,
      did: "register",
      when: new Date().toISOString(),
      if_ok: processId,
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "registered",
      process_id: processId,
    };
    const requiredHumanSlots = (contract.required_slots ?? ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"])
      .filter((key) => !String(body[key] ?? ""));
    const missingAux = (contract.must_include ?? []).filter((key) => !String(body[key] ?? ""));
    if ((view.danger_tier === "L4" || view.danger_tier === "L5") && !String(body.grant_id ?? "")) missingAux.push("grant_id");
    const missing = [...new Set([...requiredHumanSlots, ...missingAux])].map(fieldLabel);
    const referencedSource = evidenceText.match(/\b[0-9a-f]{64}\b/i)?.[0]?.toLowerCase();
    if (referencedSource) {
      const pending = await client.query(
        "SELECT 1 FROM public.logline_acts WHERE this=$1 AND did=ANY($2::text[]) LIMIT 1",
        [referencedSource, ["doubt", "not_dispatched", "evidence_incomplete", "adapter_doubted"]],
      );
      if (pending.rowCount) body.citations = [referencedSource];
    }
    return {
      action: {
        kind: "confirm_register",
        summary: humanSummary(label, fields),
        fields: Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "grant_id")),
        missing,
        risk: riskFromTier(view.danger_tier),
        register_body: body,
      },
      facts: { process_title: label, readiness: view.readiness, missing_count: missing.length, risk: riskFromTier(view.danger_tier) },
    };
  }

  if (call.name === "draft_type") {
    const title = String(call.arguments.title ?? "").trim().slice(0, 120);
    if (!title) return { action: { kind: "clarify", question: "Como você quer chamar esse novo tipo de processo?" }, facts: { draft_ready: false } };
    const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "novo-processo";
    const requires = stringList(call.arguments.requires);
    const accepts = stringList(call.arguments.accepts);
    const requestedTier = String(call.arguments.danger_tier ?? "L0");
    const dangerTier = /^L[0-5]$/.test(requestedTier) ? requestedTier : "L0";
    const draft = {
      process_id: `${slug}.v1`,
      title,
      requires,
      accepts,
      danger_tier: dangerTier,
      description: String(call.arguments.description ?? "").trim().slice(0, 500),
    };
    const summary = `Criar o tipo “${title}”${requires.length ? ` pedindo ${requires.map(fieldLabel).join(", ")}` : ""}.`;
    return { action: { kind: "confirm_new_type", summary, contract_draft: draft }, facts: { draft_ready: true, title, risk: riskFromTier(dangerTier) } };
  }

  if (call.name === "draft_grant") {
    const draft: GrantInput = {
      process: String(call.arguments.process ?? "").trim(),
      granted_by: String(call.arguments.granted_by ?? "").trim(),
      granted_to: String(call.arguments.granted_to ?? "").trim(),
      adapter: String(call.arguments.adapter ?? "*").trim() || "*",
      valid_until: String(call.arguments.valid_until ?? "").trim(),
      acu_limit: Number(call.arguments.acu_limit ?? 0),
      timeout_seconds: Number(call.arguments.timeout_seconds ?? 0),
      fs_scope: String(call.arguments.fs_scope ?? "").trim(),
      network_policy: String(call.arguments.network_policy ?? "").trim(),
    };
    const invalid = validateGrantInput(draft);
    if (invalid) return { action: { kind: "clarify", question: `Para preparar essa autorização, ainda preciso de ${fieldLabel(invalid)}.` }, facts: { draft_ready: false, missing: invalid } };
    const summary = `Autorizar ${draft.granted_to} para esse processo até ${draft.valid_until}.`;
    return { action: { kind: "confirm_grant", summary, grant_draft: draft as Record<string, unknown> }, facts: { draft_ready: true } };
  }

  if (call.name === "request_passkey") {
    const identity = String(call.arguments.identity ?? "").trim();
    const grantId = String(call.arguments.grant_id ?? "").trim();
    if (!identity || !/^[0-9a-f]{64}$/.test(grantId)) {
      return { action: { kind: "clarify", question: "Qual autorização você quer assinar e com qual identidade?" }, facts: { passkey_ready: false } };
    }
    const options = await createSignOptions(env, client, identity, grantId);
    if (!options.ok) {
      const reason = options.code in CATALOG ? renderMessage(options.code) : null;
      const question = reason ? reason.message : options.code === "not_found" ? "Não encontrei essa autorização." : "Não consegui preparar a assinatura dessa autorização.";
      return { action: { kind: "status", summary: question }, facts: { passkey_ready: false, code: options.code } };
    }
    return {
      action: { kind: "request_passkey", summary: "Assinar a autorização com Face ID ou a passkey deste dispositivo.", grant_id: grantId, sign_options: options.options as unknown as Record<string, unknown> },
      facts: { passkey_ready: true },
    };
  }

  if (call.name === "build_projection") {
    const spec = String(call.arguments.spec ?? "").trim();
    const rows = await env.PROJECTIONS.prepare(
      "SELECT projection_hash,projection_spec,class,computed_at FROM projection_docs ORDER BY computed_at DESC LIMIT 10",
    ).all();
    const existing = (rows.results as unknown as Array<Record<string, unknown>>).filter((row) => !spec || String(row.projection_spec ?? "").toLowerCase().includes(spec.toLowerCase()));
    const summary = existing.length ? `Encontrei ${existing.length} resumo${existing.length === 1 ? "" : "s"} reconstruível${existing.length === 1 ? "" : "is"} relacionado${existing.length === 1 ? "" : "s"}.` : "Ainda não há um resumo reconstruível para esse recorte.";
    return { action: { kind: "status", summary }, facts: { authoritative: false, projections: existing } };
  }

  return { action: { kind: "clarify", question: "O que você quer fazer a seguir?" }, facts: {} };
}

function replyPrompt(message: string, action: ChatAction, facts: Record<string, unknown>): string {
  return `Redija a resposta do Dream em português do Brasil, natural e curta. A decisão já foi tomada pelo servidor. ` +
    `Não mencione process_id, danger_tier, readiness, grant_id, hashes, JSON, L0/L1/L2/L3/L4/L5, banco, ledger ou nomes de ferramentas. ` +
    `Não invente fatos. Se houver campos faltando, faça uma pergunta clara. Se houver risco, explique em linguagem humana. ` +
    `Responda SOMENTE JSON {"reply":"..."}.\n\nMensagem do usuário: ${message}\nAção validada: ${JSON.stringify(action)}\nFatos validados: ${JSON.stringify(facts)}`;
}

export async function runChatTurn(
  env: ChatEnv,
  client: PgClient,
  input: { message: string; conversation_id?: string; model?: string },
): Promise<ChatTurn> {
  const conversationId = input.conversation_id || crypto.randomUUID();
  const history = await loadHistory(env.PROJECTIONS, conversationId);
  const [catalogMap, now, grants, models] = await Promise.all([
    loadContracts(client),
    nowView(client, 10),
    listGrants(client, 20),
    availableModels(env),
  ]);
  const catalog = Array.from(catalogMap.values()).map(toProcessTypeView);
  const model = selectModel(models, input.model);
  const plannerText = await completeJson(env, model, [
    { role: "system", content: "Você é um planner determinístico. Produza somente o JSON solicitado." },
    { role: "user", content: plannerPrompt({ message: input.message, history, catalog, now, grants, models }) },
  ], 900);
  const call = parsePlannerCall(plannerText);
  const result = await executeTool(env, client, call, input.message, history);
  const replyText = await completeJson(env, model, [
    { role: "system", content: "Você escreve respostas humanas curtas, sem identificadores técnicos." },
    { role: "user", content: replyPrompt(input.message, result.action, result.facts) },
  ], 350);
  const replyObject = extractJsonObject(replyText) as { reply?: unknown };
  const reply = safeHumanReply(replyObject.reply, result.action);
  await storeConversationPair(env.PROJECTIONS, conversationId, input.message, reply, result.action);
  return validateChatTurn({ reply, action: result.action, conversation_id: conversationId });
}
