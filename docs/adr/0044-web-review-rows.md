---
status: superseded
superseded_by: docs/adr/0072-the-dashboard-is-a-separate-example-plugin.md
---
# Web rows in For review

> Superseded by [0072](0072-the-dashboard-is-a-separate-example-plugin.md). Recursive Board ships no dashboard; the example dashboard plugin carries this design.

This amends [0040](0040-dashboard-view.md) and [0043](0043-review-verdicts.md).

The setting "Web pages in For review" controls web addresses in a card's newest `**Review:**`
line. It is stored on this device. Unknown saved values use the default.

- **Open in a Web viewer tab** is the default. It uses Obsidian's Web viewer when enabled on
  desktop, and opens the browser otherwise.
- **Open in the browser** always opens the browser.
- **Off** hides web rows.

A web row has an empty tick cell. It does not count toward a verdict. Approve and Send back appear
only after every file row is ticked. A card that lists no file gets its own row after its web rows,
in every mode. That row opens the card and carries the tick for the verdict.

On a phone, a web row with host `localhost`, a `127.x.x.x` address, `::1`, or `0.0.0.0` stays in
the list without a link. It displays "Open it on the computer that runs it". Other web rows remain
links.

## Why

A web page is live, so a tick cannot show that a reviewer checked a stable artifact. File rows
remain tickable because their contents can be reviewed as part of a verdict. A web-only card has
no file to tick, so its own row takes the tick. The reviewer can then approve it or send it back
from the dashboard, like any other card. The setting lets each reviewer choose how
web pages open or remove them from the list. A phone cannot reach a service bound to its own
computer's loopback address, so the row explains where to open it.
