---
status: accepted
amended_by: 0061-holder-names-who-does-the-work.md (the field is `holder`)
---
# Record agent claims on work items

The optional `owner` field does not pass to a new child. Accountability follows the parent tree. An explicit `--owner` on `wi new` sets the new child's owner. Existing cards keep their owner. The claim is stored in `holder` ([holder-names-who-does-the-work](0061-holder-names-who-does-the-work.md)); an old card's `agent` is read as its holder. A parent's holder passes only to a child created in `doing`, and `holder: agent` does not pass at all. Children created in `options` or `backlog` have no holder. Areas cannot have a holder. `wi new --template area` does not inherit a parent holder. An explicit `--agent` for an area fails before `wi` writes a file. For other templates, an explicit `--agent` overrides inheritance. `wi claim` writes the holder and doing status to one card in one operation. It refuses a different holder, a done card, or a board with a child in doing that someone else works (amended by [0038](0038-nested-claims.md)). Repeating a claim by the same agent while the card is doing writes nothing. If that agent is still recorded but the card has another active status, claiming it moves it to doing. That is how a worker starts a card it was delegated ([0058](0058-delegate-a-card.md)). A claim replaces the reserved holder `agent` with the claimant's name.

When a worker stops before finishing, its dispatcher runs `wi release`. It removes the holder, returns the card to options, and appends a dated reason and optional continuation location under Notes. If Notes is missing, the command adds it. Both commands use the shared status transition rules and write only the card file.

An agent owns the subtree of the card assigned to it. It may split that work into child cards and move its own child cards to options for assignment.
