---
status: accepted
---
# The dashboard summary in the CLI

`wi dashboard` gives an agent the dashboard ([0040](0040-dashboard-view.md)) in one call. It
returns every panel by default. Repeat `--panel` to select `review`, `progress`, `agents`, `people`,
or `attention`. JSON contains only the selected panels. It writes nothing.

The command applies the plugin's own rules. They moved from `src/plugin/dashboard-model.ts` to
`src/shared/dashboard.ts`, and the plugin file re-exports them. The CLI reads each card's
modification time from its file, as the plugin reads it from Obsidian, so the idle hour and the
finished window agree.

The reviewer is `--you <name>`. The plugin keeps the name as personal dashboard state
([0045](0045-personal-dashboard-state.md)), and the CLI keeps no per-person state. Without `--you`,
no card waits for review, and `wi dashboard` warns on stderr. The name also decides which claims
were handed over, as on the dashboard.

`--parent <ref>` names a root or an area. A root limits the cards to that root, as the root picker
does. An area is the focus, as a click on its Progress row is: every section shows only the cards
inside it, grouped under the next area down. Any other card is refused.

Each review row lists every path from the card's `**Review:**` line, web addresses included. The
web-row setting and the review ticks are personal display state, so the CLI leaves them out.

The People panel lists person notes that hold open cards, with each card's status. It has no timing
or idle state. The Agents panel excludes people and includes requests for any agent, the active count,
and the configured limit.

## Why

An agent that reports to a person needs the same picture the person sees. Before this, it had to
rebuild the dashboard from `wi agents`, `wi children` and card files, with its own idea of idle and
of review. One summary from the shared rules keeps the agent and the dashboard in step.
