---
status: accepted
amends: docs/adr/0014-agent-claims.md (the doing-child refusal), docs/adr/0034-agent-limit.md (the count)
amended_by: 0061-holder-names-who-does-the-work.md (the field is `holder`)
---
# Let one agent hold a card and its current subtask

An agent that holds a card may claim the card's children, and a child it holds in doing does not
stop it claiming the parent. `wi claim` still refuses a board with a child in doing that a
different agent or a person works.

`wi agents` counts distinct agents with a card in doing, not cards. It reads each card's `holder`, or an old card's `agent`, and does not count a person or the reserved holder `agent`. It also lists each claimed
doing card, so the owner and a dispatcher see each agent's current subtask under its main card.
The limit warning in `wi claim` fires only when the claim adds a new agent.

Workers claimed only their top card, so their subtasks moved with no holder on them. A claim per
subtask shows what each agent does now. Counting cards would then charge one agent several times
against `maxAgents`.

`wi claim` refuses a card with an open dependency unless the same agent already holds it in doing.
`wi status <ref> doing` also refuses a card with an open dependency. `wi children` marks it
`[waits on N]` and reports its open dependencies in JSON. An external wait must have its own card.

`wi status <ref> done` reports the parent when that was its last open child, and does not close
it. A parent can have criteria of its own beyond its children, and closing it would write a second
file.
