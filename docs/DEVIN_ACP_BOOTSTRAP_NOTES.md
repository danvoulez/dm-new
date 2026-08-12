# Devin / ACP Bootstrap Notes (route-to-devin.v1)

> Devin is a dangerous door, not a shortcut. It must never become an executor parallel to the
> Lab.

`route-to-devin.v1` is now **L4 (dangerous external delegation)** (§21): it requires a grant,
and its `route_to_devin` adapter is intentionally **unregistered** (contract-only / dry-run)
until Day 6. Routing work to an external autonomous coding agent is a real outbound effect.

## Two distinct things the roadmap groups

| | ACP (Agent Client Protocol) | Devin route |
|---|---|---|
| What | Open **JSON-RPC 2.0 over stdio** standard connecting *any editor to any agent* (created by Zed, now community-governed). | Delegating a specific task to **Devin**, an external autonomous coding agent. |
| Analogy | "LSP for AI agents" — standardizes *where an agent lives in the editor*. | A privileged outbound request to a third-party executor. |
| Relation to MCP | MCP = *what tools/data* an agent can access; ACP = *where the agent lives*. Complementary. | Orthogonal — Devin is the callee, ACP is a transport shape. |

Adopting ACP (rather than a bespoke protocol) means the Lab's future ACP adapter speaks a
standard already supported by Zed, Neovim, Claude Code, and Gemini CLI — less lock-in, less
custom glue.

## Lab requirements when the door is built (Day 6)

- **Adapter, not authority** (`lab/adapters/devin.py`, dry-run first): validate the grant,
  return `would_route`, and **do not call Devin**. `route-to-devin.v1 is rehearsable, not
  external yet.`
- **Grant + scope.** L4 means a grant naming budget and the routable scope; no grant →
  `missing_required_grant` (already enforced). No fallback receipt (already enforced via
  `adapter_not_registered`).
- **Evidence.** Future `evidence_must_include`: the Devin session/run id and the returned
  artifact hash — a route must prove where it sent work and what came back.
- **Containment.** Devin's output is a *candidate* that re-enters the Lab as a new Act for
  review/closure — it is never auto-merged. Devin does not get to close its own loop.

## Open decisions (Day 6)

- ACP request/response schemas (`schemas/acp/*.schema.json`) and whether the Devin route rides
  ACP or a Devin-specific REST contract.
- Diagnostic CLI (`lab acp doctor`, `lab acp dry-run`) and the Devin route dry-run.

## Sources

- [Agent Client Protocol — Introduction](https://agentclientprotocol.com/get-started/introduction)
- [agentclientprotocol/agent-client-protocol (GitHub)](https://github.com/agentclientprotocol/agent-client-protocol)
- [ACP vs MCP, editor support — Morph](https://www.morphllm.com/agent-client-protocol)
