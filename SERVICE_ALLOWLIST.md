# Service Allowlist

Resident services: receiver selector, clock selector, queue projection, executor dispatcher, projection rebuilder, system services. Adapters are invoked leaves, not resident authorities by default.

The machine-readable allowlist lives at `fleet/services/allowlist.yml`.

Use `lab fleet audit --root fleet` to verify:

- all three Lab machines are registered as bench, capital, and engine;
- each machine has physical dependency evidence;
- resident service records include binary, env file, logs, restart policy, purpose, process classes, and health check;
- every resident service appears in the allowlist;
- services reference registered machines.
