---
status: accepted
---
# Record agent claims on work items

The optional `owner` field is inherited by new child items. A parent `agent` is inherited only when the child is created in `doing`; `options` and `backlog` children are left unclaimed so another agent can claim them. An explicit `--agent` on `wi new` overrides this rule. `wi claim` writes the agent name and doing status to one card in one operation. It refuses a different agent, a done card, or a board with a child in doing. Repeating a claim by the same agent while the card is doing writes nothing. If that agent is still recorded but the card has another active status, claiming it restores doing.

When a worker stops before finishing, its dispatcher runs `wi release`. It removes the agent, returns the card to options, and appends a dated reason and optional continuation location under Notes. If Notes is missing, the command adds it. Both commands use the shared status transition rules and write only the card file.

An agent owns the subtree of the card assigned to it. It may split that work into child cards and move its own child cards to options for assignment.
