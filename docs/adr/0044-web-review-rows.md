---
status: accepted
---
# Web rows in For review

This amends [0040](0040-dashboard-view.md) and [0043](0043-review-verdicts.md).

The setting "Web pages in For review" controls web addresses in a card's newest `**Review:**`
line. It is stored with the dashboard state in plugin data. Unknown saved values use the default.

- **Open in a Web viewer tab** is the default. It uses Obsidian's Web viewer when enabled on
  desktop, and opens the browser otherwise.
- **Open in the browser** always opens the browser.
- **Off** hides web rows. If no file rows remain, the dashboard shows one row that opens the card.

A web row has an empty tick cell. It does not count toward a verdict. Approve and Send back appear
only after every file row is ticked. A card with only web rows has no verdict buttons, so its agent
closes it.

On a phone, a web row with host `localhost`, a `127.x.x.x` address, `::1`, or `0.0.0.0` stays in
the list without a link. It displays "Open it on the computer that runs it". Other web rows remain
links.

## Why

A web page is live, so a tick cannot show that a reviewer checked a stable artifact. File rows
remain tickable because their contents can be reviewed as part of a verdict. A web-only card has
no file evidence to approve, so its agent closes it. The setting lets each reviewer choose how
web pages open or remove them from the list. A phone cannot reach a service bound to its own
computer's loopback address, so the row explains where to open it.
