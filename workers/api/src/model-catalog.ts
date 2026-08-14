export type GoldenBridgeEnv = {
  GOLDEN_BRIDGE_URL?: string;
  GOLDEN_BRIDGE_ACCESS_ID?: string;
  GOLDEN_BRIDGE_ACCESS_SECRET?: string;
  GOLDEN_BRIDGE_TUNNEL_ID?: string;
};

export type CatalogSourceStatus = "available" | "degraded" | "not_configured";

export type CatalogSource = {
  id: "local" | "vercel" | "cloudflare";
  label: string;
  status: CatalogSourceStatus;
  checked_at: string;
  model_count: number;
  message?: string;
};

export type CatalogCertification = {
  profile: "dream-agent.v1";
  status: "current" | "failed";
  certified_at: string;
  expires_at: string;
  checks: Record<"conversation" | "tool_call" | "tool_result" | "schema" | "system_prompt", boolean>;
  reason?: string;
};

export type ModelInfo = {
  id: string;
  object: "model";
  name: string;
  source: CatalogSource["id"];
  upstream_model: string;
  context_window?: number | null;
  capabilities: Record<string, unknown>;
  selectable: boolean;
  certification: CatalogCertification;
};

export type ModelCatalog = {
  object: "list";
  provider: "golden-bridge";
  generated_at: string;
  ttl_seconds: number;
  certification_profile: "dream-agent.v1";
  sources: CatalogSource[];
  data: ModelInfo[];
};

const BRIDGE_DEFAULT = "https://inference.minilab.work";
const REQUIRED_CHECKS = ["conversation", "tool_call", "tool_result", "schema", "system_prompt"] as const;

export class ModelCatalogError extends Error {
  readonly status: number;
  readonly code: string;
  readonly action: string;

  constructor(status: number, code: string, message: string, action: string) {
    super(message);
    this.name = "ModelCatalogError";
    this.status = status;
    this.code = code;
    this.action = action;
  }
}

export async function goldenBridgeFetch(
  env: GoldenBridgeEnv,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const publicBase = (env.GOLDEN_BRIDGE_URL ?? BRIDGE_DEFAULT).replace(/\/+$/, "");
  const host = new URL(publicBase).host;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (env.GOLDEN_BRIDGE_ACCESS_ID && env.GOLDEN_BRIDGE_ACCESS_SECRET) {
    headers["CF-Access-Client-Id"] = env.GOLDEN_BRIDGE_ACCESS_ID;
    headers["CF-Access-Client-Secret"] = env.GOLDEN_BRIDGE_ACCESS_SECRET;
  }
  if (env.GOLDEN_BRIDGE_TUNNEL_ID) {
    return fetchImpl(`https://${env.GOLDEN_BRIDGE_TUNNEL_ID}.cfargotunnel.com${path}`, {
      ...init,
      headers: { ...headers, Host: host },
    });
  }
  return fetchImpl(`${publicBase}${path}`, { ...init, headers });
}

export async function fetchModelCatalog(env: GoldenBridgeEnv, fetchImpl: typeof fetch = fetch): Promise<ModelCatalog> {
  let response: Response;
  try {
    response = await goldenBridgeFetch(env, "/v1/models", { headers: { Accept: "application/json" } }, fetchImpl);
  } catch {
    throw new ModelCatalogError(502, "model_catalog_unavailable", "Não foi possível consultar o catálogo da Golden Bridge.", "Verifique a conexão com a Golden Bridge e tente atualizar o catálogo.");
  }
  if (!response.ok) {
    throw new ModelCatalogError(502, "model_catalog_unavailable", `A Golden Bridge recusou a consulta do catálogo (HTTP ${response.status}).`, "Verifique o estado da Golden Bridge e tente atualizar o catálogo.");
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!isModelCatalog(body)) {
    throw new ModelCatalogError(502, "model_catalog_invalid", "A Golden Bridge devolveu um catálogo inválido.", "Não selecione um modelo; corrija o contrato do catálogo na Golden Bridge.");
  }
  return body;
}

export function requireExplicitCatalogModel(catalog: ModelCatalog, requested: string, now = new Date()): ModelInfo {
  const modelId = requested.trim();
  if (!modelId) {
    throw new ModelCatalogError(400, "model_required", "Escolha um modelo da Golden Bridge antes de enviar.", "Abra o seletor dentro da caixa de mensagem.");
  }
  const generatedAt = Date.parse(catalog.generated_at);
  if (!Number.isFinite(generatedAt) || generatedAt + catalog.ttl_seconds * 1000 <= now.getTime()) {
    throw new ModelCatalogError(503, "model_catalog_expired", "O catálogo da Golden Bridge venceu.", "Atualize o catálogo antes de enviar.");
  }
  const model = catalog.data.find((candidate) => candidate.id === modelId);
  if (!model || !model.selectable) {
    throw new ModelCatalogError(503, "model_unavailable", `O modelo ${modelId} não está disponível e certificado agora.`, "Escolha outro modelo habilitado no seletor.");
  }
  if (model.certification.profile !== "dream-agent.v1" || model.certification.status !== "current" || !REQUIRED_CHECKS.every((check) => model.certification.checks[check])) {
    throw new ModelCatalogError(503, "model_not_certified", `O modelo ${modelId} não passou pelo perfil dream-agent.v1.`, "Escolha outro modelo habilitado no seletor.");
  }
  if (Date.parse(model.certification.expires_at) <= now.getTime()) {
    throw new ModelCatalogError(503, "model_certification_expired", `A certificação do modelo ${modelId} venceu.`, "Atualize o catálogo ou escolha outro modelo certificado.");
  }
  return model;
}

function isModelCatalog(value: unknown): value is ModelCatalog {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<ModelCatalog>;
  return body.object === "list"
    && body.provider === "golden-bridge"
    && body.certification_profile === "dream-agent.v1"
    && typeof body.generated_at === "string"
    && typeof body.ttl_seconds === "number"
    && Array.isArray(body.sources)
    && Array.isArray(body.data);
}
