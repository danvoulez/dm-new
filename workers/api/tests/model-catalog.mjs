import assert from "node:assert/strict";
import test from "node:test";
import { fetchModelCatalog, goldenBridgeFetch, requireExplicitCatalogModel } from "../src/model-catalog.ts";

const currentCatalog = {
  object: "list",
  provider: "golden-bridge",
  generated_at: "2026-08-14T10:00:00.000Z",
  ttl_seconds: 3600,
  certification_profile: "dream-agent.v1",
  sources: [
    { id: "local", label: "Local", status: "available", checked_at: "2026-08-14T10:00:00.000Z", model_count: 1 },
    { id: "vercel", label: "Vercel AI Gateway", status: "degraded", checked_at: "2026-08-14T10:00:00.000Z", model_count: 0, message: "offline" },
    { id: "cloudflare", label: "Cloudflare AI Gateway", status: "not_configured", checked_at: "2026-08-14T10:00:00.000Z", model_count: 0 },
  ],
  data: [{
    id: "local/qwen", object: "model", name: "Qwen", source: "local", upstream_model: "qwen", selectable: true,
    capabilities: {}, certification: {
      profile: "dream-agent.v1", status: "current", certified_at: "2026-08-14T10:00:00.000Z", expires_at: "2026-08-14T10:20:00.000Z",
      checks: { conversation: true, tool_call: true, tool_result: true, schema: true, system_prompt: true },
    },
  }],
};

test("accepts only an explicit selectable model with an unexpired dream-agent.v1 certificate", async () => {
  const fetchImpl = async () => new Response(JSON.stringify(currentCatalog), { status: 200 });
  const catalog = await fetchModelCatalog({}, fetchImpl);
  assert.equal(requireExplicitCatalogModel(catalog, "local/qwen", new Date("2026-08-14T10:04:00.000Z")).id, "local/qwen");
  assert.throws(() => requireExplicitCatalogModel(catalog, "", new Date("2026-08-14T10:04:00.000Z")), (error) => error.code === "model_required" && error.status === 400);
  assert.throws(() => requireExplicitCatalogModel(catalog, "local/missing", new Date("2026-08-14T10:04:00.000Z")), (error) => error.code === "model_unavailable" && error.status === 503);
  assert.throws(() => requireExplicitCatalogModel(catalog, "local/qwen", new Date("2026-08-14T10:21:00.000Z")), (error) => error.code === "model_certification_expired");
});

test("does not retry a failed tunnel request through another hidden transport", async () => {
  let calls = 0;
  const response = await goldenBridgeFetch({ GOLDEN_BRIDGE_TUNNEL_ID: "tunnel", GOLDEN_BRIDGE_URL: "https://inference.example" }, "/v1/models", {}, async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  });
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});
