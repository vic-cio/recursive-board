---
status: accepted
---
# Keep area membership in the tree

Cards show their area through the parent tree. The old setting added a second path for the same information. It also required a retag after each move. The project removed that feature in 0.8.0.

`wi new`, the board add row and `wi validate` do not read or write area tags. `wi retag` and `wi graph` stay as stubs. They say the commands were removed. The plugin removes the Area tags setting. It ignores an old `areaTags` key. It preserves that key when it saves other settings.

Keep two guards for old cards. The board hides `area/` chips. Tags… leaves old area tags out. `wi tag` may keep refusing those tags. Do not edit existing area tags. The owner decides when to clean them up.

The board tree is the only current view of area membership. Revisit graph colours when the owner asks.
