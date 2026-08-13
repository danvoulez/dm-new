import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync(new URL("../src/components/layout/AppLayout.tsx", import.meta.url), "utf8");
for (const label of ["Pendências", "Todos os processos", "Tipos de processo", "Regras"]) assert.match(layout, new RegExp(label));
for (const oldLabel of ["Conversar", "Agora", "Sugestões", "Resumos", "Novo \\(formulário\\)"]) assert.doesNotMatch(layout, new RegExp(oldLabel));
assert.match(layout, /PiPlus[^\n]+\/> Novo/);

const home = fs.readFileSync(new URL("../src/pages/Home.tsx", import.meta.url), "utf8");
assert.match(home, /dmApi\.chatTurn/);
assert.doesNotMatch(home, /dmApi\.chatCompile/);
assert.doesNotMatch(home, /model selector|Tipos disponíveis|demo-credential/i);

const action = fs.readFileSync(new URL("../src/components/chat/ActionCard.tsx", import.meta.url), "utf8");
assert.match(action, /Não é isso\?/);
assert.match(action, /Assinar com Face ID/);

console.log("ui F4 surface guard: ok");


const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
for (const legacy of ["/agora", "/casos", "/permissoes", "/novo", "/sugestoes", "/resumos"]) assert.match(app, new RegExp(legacy.replace("/", "\\/")));

assert.match(home, /needs_you\.length > 0/);
assert.match(home, /navigate\("\/pendencias", \{ replace: true \}\)/);
assert.doesNotMatch(home, /absolute[^\n]+composer|composer[^\n]+absolute/i);
assert.match(home, /\/processos\/\$\{message\.caseHash\}/);

const pending = fs.readFileSync(new URL("../src/pages/Pendentes.tsx", import.meta.url), "utf8");
assert.match(pending, /<details[\s\S]*process_id:/);
assert.match(pending, /key=\{selected\?\.id/);

const types = fs.readFileSync(new URL("../src/pages/TiposProcesso.tsx", import.meta.url), "utf8");
assert.match(types, /<details[\s\S]*process_id:/);
assert.match(types, /readinessLabel/);

const rules = fs.readFileSync(new URL("../src/pages/Regras.tsx", import.meta.url), "utf8");
assert.match(rules, /<details[\s\S]*network_policy:/);
