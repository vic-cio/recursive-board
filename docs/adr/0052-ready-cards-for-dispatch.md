---
status: accepted
---
# Query cards ready for dispatch

`wi ready --json` selects unclaimed cards in options. It excludes archived cards, areas, blocked cards, cards with open or invalid dependencies, cards with broken parent links, and boards with an active child held by someone else. It sorts the eligible cards by priority, update date, then name. JSON includes excluded option cards with reasons.

The dispatcher workflow assigns from options, while `wi claim` also permits other states for direct work. `--parent` limits the query to one board's descendants. Without it, the query covers the vault. An optional `--agent` evaluates a nested claim for that agent. The query reads the current vault state and adds no scheduling field or cache.
