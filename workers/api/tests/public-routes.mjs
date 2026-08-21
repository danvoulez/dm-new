import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const publicRoutes = [...source.matchAll(/app\.(get|post)\("([^\"]+)"/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
for (const required of [
  "GET /api/about",
  "GET /api/search",
  "POST /api/append",
  "GET /api/now",
  "GET /api/processes",
  "GET /api/pendencies",
  "GET /api/cases/:hash",
  "GET /api/process-types",
  "GET /api/process-types/:process_id",
  "GET /api/candidates",
  "GET /api/vocabulary",
  "GET /api/grants",
  "GET /api/grants/:gid",
  "POST /api/advance",
  "POST /api/process-types",
  "POST /api/grants",
  "POST /api/grants/:gid/signoff",
  "POST /api/grants/:gid/revoke",
  "POST /api/webauthn/enroll/options",
  "POST /api/webauthn/enroll/verify",
  "POST /api/webauthn/sign/options",
  "POST /api/webauthn/sign/verify",
  "POST /api/chat/turn",
]) assert.ok(publicRoutes.includes(required), `missing public route ${required}`);

assert.ok(!publicRoutes.includes("POST /api/register"), "raw semantic register route must stay removed");
assert.ok(!publicRoutes.includes("POST /api/chat/compile"), "parallel chat compile route must stay removed");

const appendRoute = source.slice(source.indexOf('app.post("/api/append"'), source.indexOf('app.get("/api/models"'));
assert.match(appendRoute, /appendTool\(client, proposal/);
assert.doesNotMatch(appendRoute, /fields\[slot\]\s*=|new Date\(\)\.toISOString\(\)/, "canonical append route must not fill semantic fields");

for (const marker of [
  /demo-credential/i,
  /success\s*:\s*true[^\n]*stub/i,
  /Registrado\. Pendente\./i,
  /not wired/i,
  /fake success/i,
]) assert.doesNotMatch(source, marker);

for (const match of source.matchAll(/return c\.json\(\{[^;]*data:\s*\[\][^;]*\}\s*,\s*(\d+)\)/gs)) {
  assert.ok(Number(match[1]) >= 400, `empty model list must fail loud, got ${match[1]}`);
}

console.log(`worker public routes: canonical about/search/append, no raw register (${publicRoutes.length} declared)`);
