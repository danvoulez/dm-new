# Machine Registry

Machine records live in `fleet/machines/*.yml` and are audited by `lab fleet audit`.

| Machine | Role | Allowed services |
|---|---|---|
| lab-8gb | capital | receiver-selector, clock-selector, queue-projection, executor-dispatcher |
| lab-512 | engine | projection-rebuilder, approved-maintenance |
| lab-256 | bench | workbench, approved-maintenance |

Each machine record must include hostname, operator account, Lab root, deployed CLI path, allowed/forbidden adapters, physical dependencies, last seen time, and evidence hashes.
