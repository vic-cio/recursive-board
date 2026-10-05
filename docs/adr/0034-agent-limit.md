---
status: accepted
amended_by: 0066-count-only-working-agents.md (an agent that only waits on its children does not count), 0072-the-dashboard-is-a-separate-example-plugin.md (wi agents reports the count and the limit)
---

# Set an advisory concurrent agent limit per vault

The vault config may contain `maxAgents`, a non-negative whole number or `null`. The
Recursive Board settings tab writes this setting, and the dashboard Agents panel reports it with the number of
distinct agents that hold a work-item card in `doing` (amended by [0038](0038-nested-claims.md) and [0066](0066-count-only-working-agents.md)). `WI_MAX_AGENTS` overrides the file for
one CLI run.

The dispatcher reads the count before starting a worker and waits when the count reaches the
limit. The setting is advisory. `wi claim` does not enforce it, because a dispatcher can decide
whether to exceed the cap.

The count is vault-wide, so nested dispatchers share the same pool. A zero limit means do not
start any workers; `null` means no cap is configured.
