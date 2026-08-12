# Lab Topology

| Organ | Path | Authority |
|---|---|---|
| Memory | `public.logline_acts`, local `.lab/lab.sqlite` dev mirror | authoritative ledger only |
| Hands | `lab/cli.py` | writes canonical receipts |
| Law | `processes/*.v1.yml` | activation contracts |
| Nervous tree | `runtime/{receiver,clock,executor}` | selectors and dispatcher |
| Leaves | `runtime/adapters` | dumb bounded effects |
| Eyes | `projections` | non-authoritative rebuildable views |
| Imagination | `dream-machine` | candidate/proposal only |
| Body | `fleet` | physical machine registry |
