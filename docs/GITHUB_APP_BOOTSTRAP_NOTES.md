# GitHub App Bootstrap Notes (github-check.v1)

> GitHub enters as a governed door/adapter, not a sovereign system.

`github-check.v1` is **contract-only** today (§19): no adapter is registered, so it cannot run
and never falls back to a receipt. These notes capture what the real door requires when it is
built (Day 6).

## Why a GitHub App (not a PAT)

The **Checks API is GitHub-App-only** — a fine-grained Personal Access Token cannot be granted
Checks permissions. So the Lab's GitHub door must be a GitHub App, not a token.

## Least-privilege permissions

Request the **minimum**:

- `checks: write` — to create/update check runs (the one capability `github-check.v1` needs).
- `checks: read` only if reading existing runs.
- Nothing else. The REST API returns an `X-Accepted-GitHub-Permissions` header naming exactly
  what an endpoint needs — use it to keep the manifest minimal.

## Mapping to the Lab model

- **Adapter, not authority.** When built, `lab/adapters/github.py` is an adapter the executor
  dispatches; it does not authorize itself. A check-run write is an external effect → tier
  **L3** (compensable, idempotent-ish: a check run can be updated), gated like other doors.
- **Evidence.** Future `evidence_must_include` for a check run: `check_run_id`, `conclusion`,
  `head_sha` — a delivered check must prove what it wrote.
- **Read-only first.** Day 6 starts with a read-only adapter (no external effect) before any
  `checks: write` door opens — adapter exists, causes no effect, evidence shape proven in dry-run.

## Open decisions (Day 6)

- App manifest (permissions + webhook events) under least privilege.
- Secret handling (App id, private key) via the secrets inventory — never in the ledger.
- Webhook-as-candidate: an inbound webhook becomes a candidate Act, not a direct execution.

## Sources

- [Choosing permissions for a GitHub App — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Permissions required for GitHub Apps — GitHub Docs](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
