---
status: accepted
amended_by: 0061-holder-names-who-does-the-work.md (requests for any agent first)
---
# Query cards ready for dispatch

`wi ready --json` selects unclaimed cards in options. A card whose holder is the reserved value `agent` asks for any agent, so it counts as unclaimed. It excludes archived cards, areas, cards with a holder, cards with open or invalid dependencies, cards with broken parent links, and boards with an active child held by someone else. It sorts the requests for any agent first, then by priority, update date, then name. Each card in JSON carries its `holder` and `request: true` for a request. JSON includes excluded option cards with reasons.

The dispatcher workflow assigns from options, while `wi claim` also permits other states for direct work. `--parent` limits the query to one board's descendants. Without it, the query covers the vault. An optional `--agent` evaluates a nested claim for that agent. The query reads the current vault state and adds no scheduling field or cache.
