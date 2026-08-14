#!/usr/bin/env node
import assert from "node:assert/strict";

const baseUrl = String(process.env.GOLDEN_BRIDGE_URL ?? "").replace(/\/+$/, "");
if (!baseUrl) {
  console.error("GOLDEN_BRIDGE_URL is required; the acceptance script never guesses a production target.");
  process.exit(2);
}

const headers = { "content-type": "application/json", accept: "application/json" };
if (process.env.GOLDEN_BRIDGE_TOKEN) headers.authorization = `Bearer ${process.env.GOLDEN_BRIDGE_TOKEN}`;
if (process.env.GOLDEN_BRIDGE_ACCESS_ID && process.env.GOLDEN_BRIDGE_ACCESS_SECRET) {
  headers["CF-Access-Client-Id"] = process.env.GOLDEN_BRIDGE_ACCESS_ID;
  headers["CF-Access-Client-Secret"] = process.env.GOLDEN_BRIDGE_ACCESS_SECRET;
}

const catalogResponse = await fetch(`${baseUrl}/v1/models`, { headers, signal: AbortSignal.timeout(30_000) });
assert.equal(catalogResponse.status, 200, `catalog returned HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
assert.equal(catalog.provider, "golden-bridge");
assert.equal(catalog.certification_profile, "dream-agent.v1");

const requestedSources = process.env.ACCEPTANCE_SOURCES
  ? process.env.ACCEPTANCE_SOURCES.split(",").map((item) => item.trim()).filter(Boolean)
  : catalog.sources.filter((source) => source.status !== "not_configured").map((source) => source.id);
const report = [];

for (const source of requestedSources) {
  const sourceState = catalog.sources.find((item) => item.id === source);
  assert.ok(sourceState, `source missing from catalog: ${source}`);
  const model = catalog.data.find((item) => item.source === source && item.selectable);
  assert.ok(model, `${source}: no selectable dream-agent.v1 model (${sourceState.status}: ${sourceState.message ?? "no detail"})`);
  const systemSentinel = `DREAM_ACCEPT_${source.toUpperCase()}`;
  const toolResult = `TOOL_RESULT_${source.toUpperCase()}`;
  const tools = [{
    type: "function",
    function: {
      name: "acceptance_probe",
      description: "Return the supplied value.",
      parameters: { type: "object", properties: { value: { type: "string", const: "ok" } }, required: ["value"], additionalProperties: false },
    },
  }];
  const firstMessages = [
    { role: "system", content: `Call acceptance_probe. Preserve this token for the next response: ${systemSentinel}` },
    { role: "user", content: "Run the acceptance probe with value ok." },
  ];
  const first = await completion(model.id, {
    messages: firstMessages,
    tools,
    tool_choice: { type: "function", function: { name: "acceptance_probe" } },
    temperature: 0,
  });
  verifyRoute(first.response, first.body, model);
  const assistant = first.body.choices?.[0]?.message;
  const call = assistant?.tool_calls?.find((item) => item?.function?.name === "acceptance_probe");
  assert.ok(call, `${model.id}: tool call missing`);
  assert.equal(JSON.parse(call.function.arguments).value, "ok", `${model.id}: tool arguments changed`);

  const second = await completion(model.id, {
    messages: [...firstMessages, assistant, { role: "tool", tool_call_id: call.id, content: toolResult }],
    tools,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "acceptance_result",
        strict: true,
        schema: {
          type: "object",
          properties: { system: { type: "string", const: systemSentinel }, tool_result: { type: "string", const: toolResult } },
          required: ["system", "tool_result"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0,
  });
  verifyRoute(second.response, second.body, model);
  const structured = JSON.parse(second.body.choices?.[0]?.message?.content ?? "null");
  assert.deepEqual(structured, { system: systemSentinel, tool_result: toolResult }, `${model.id}: system/tool/schema round-trip changed`);
  report.push({ source, model: model.id, request_id: second.response.headers.get("x-lab-request-id"), fallback: false, ok: true });
}

const unknown = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({ model: "acceptance/does-not-exist", messages: [{ role: "user", content: "must fail" }] }),
  signal: AbortSignal.timeout(30_000),
});
assert.equal(unknown.status, 404, `unknown exact route returned HTTP ${unknown.status}, expected 404`);
const unknownBody = await unknown.json();
assert.equal(unknownBody.error?.code, "model_unknown");

console.log(JSON.stringify({ ok: true, provider: "golden-bridge", routes: report, unknown_route: "rejected", note: "No source was inferred or substituted." }, null, 2));

async function completion(model, body) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, stream: false, ...body }),
    signal: AbortSignal.timeout(120_000),
  });
  const responseBody = await response.json().catch(() => null);
  assert.equal(response.status, 200, `${model}: HTTP ${response.status} ${responseBody?.error?.code ?? "invalid body"}`);
  return { response, body: responseBody };
}

function verifyRoute(response, body, model) {
  assert.equal(response.headers.get("x-lab-requested-model"), model.id);
  assert.equal(response.headers.get("x-lab-executed-model"), model.id);
  assert.equal(response.headers.get("x-lab-fallback"), "false");
  assert.equal(body.model, model.id);
  assert.equal(body.lab?.requested_model, model.id);
  assert.equal(body.lab?.executed_model, model.id);
  assert.equal(body.lab?.fallback, false);
  const expectedSource = model.source === "vercel" ? "vercel-ai-gateway" : model.source === "cloudflare" ? "cloudflare-ai-gateway" : "local";
  assert.equal(response.headers.get("x-lab-source"), expectedSource);
}
