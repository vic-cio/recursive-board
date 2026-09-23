---
status: accepted
---

# Label colours derive from label text

The board renders labels as chips and derives each chip's colour from its label text. The same label therefore keeps the same colour across views without storing a colour or maintaining a separate mapping.

## Considered options

A configurable colour map would allow personal choices, but needs settings and a way to keep those settings consistent. The derived colour gives up manual selection to avoid that extra state.
