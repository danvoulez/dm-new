# Bench vs Bootstrap vs Production (`LAB_MODE`)

> A bench ledger must never be mistaken for the real birth of the Lab.

The Lab runs in one of three explicit modes, selected by the `LAB_MODE` environment
variable. The default is the **safe** one.

| `LAB_MODE` | Meaning | Destructive ops | Authority |
|---|---|---|---|
| `bench` *(default)* | Local workbench: throwaway SQLite ledger for development and tests. | **Allowed** (`reset-bench`). | **None.** Bench acts are stamped `lab_mode=bench` and carry no real authority. |
| `bootstrap` | The one-time real birth of a Lab on physical machines (Day 8). | Refused by `reset-bench`. | Real — genesis is the actual root. |
| `production`/`future` | A live, running Lab. | Refused. | Real. |

`lab_mode()` reads `LAB_MODE` live (never cached at import), defaulting to `bench`.

## Rules

1. **Destructive commands only in bench.** `lab bootstrap reset-bench` refuses unless
   `LAB_MODE=bench`. It additionally refuses any target that is not a `.sqlite` file inside
   `<repo>/.lab`, refuses the protected real ledger name (`lab.sqlite`), and refuses
   `HOME`, `/`, directories, and empty paths. The resolved target is always reported.
2. **Bench acts are marked bench.** `lab bootstrap genesis` stamps every genesis with
   `lab_mode=bench`, the package version, the local `machine_context` (hostname/platform/
   python — no secrets), and the schema version.
3. **Bench has no access-control membrane.** The bench SQLite store has no RLS or
   `service_role` boundary (see `reports/day2/sqlite_postgres_parity.md`). This is acceptable
   *only* because bench is single-user and local. Never point bench tooling at a real ledger.

## The bench lifecycle

```bash
# create / open a clean local ledger (idempotent)
LAB_MODE=bench lab bootstrap local --db .lab/test.sqlite

# stamp the explicit origin act (first act, idempotent)
LAB_MODE=bench lab bootstrap genesis --db .lab/test.sqlite

# glance at bench state (mode, count, genesis present)
LAB_MODE=bench lab bootstrap status --db .lab/test.sqlite

# wipe and recreate the bench ledger — bench-only, safety-checked
LAB_MODE=bench lab bootstrap reset-bench --db .lab/test.sqlite
```

The default `--db` is `.lab/test.sqlite` (the bench ledger), deliberately distinct from the
real local ledger `.lab/lab.sqlite` that the rest of the CLI uses via `LAB_DB`.

## Acceptance (§6)

> nenhum teste local se confunde com nascimento real do Lab — **met**: destructive ops are
> bench-gated, the bench DB is name- and path-isolated from the real ledger, and every bench
> act is stamped `lab_mode=bench`.
