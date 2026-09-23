---
status: proposed
---
# Record agent claims on work items

The optional `agent` field is inherited by new child items, as is `owner`. A claim is proposed as the agent name together with doing status, written in one operation by `wi claim`. When a worker stops before finishing, `wi release` would clear the field, return the card to options, and add a short reason and continuation location to its Notes.

An agent owns the subtree of the card assigned to it. It may split that work into child cards and move its own child cards to options for assignment. A claim or release command is not implemented yet.
