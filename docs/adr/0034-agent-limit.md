---
status: accepted
---

# Set an advisory concurrent agent limit per vault

The vault's `.wi.json` may contain `maxAgents`, a non-negative whole number or `null`. The
Recursive Board settings tab writes this setting, and `wi agents` reports it with the number of
work-item cards in `doing` that have a non-empty `agent`. `WI_MAX_AGENTS` overrides the file for
one CLI run.

The dispatcher reads the count before starting a worker and waits when the count reaches the
limit. The setting is advisory. `wi claim` does not enforce it, because a dispatcher can decide
whether to exceed the cap.

The count is vault-wide, so nested dispatchers share the same pool. A zero limit means do not
start any workers; `null` means no cap is configured.
