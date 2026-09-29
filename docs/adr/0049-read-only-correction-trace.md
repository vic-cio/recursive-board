---
status: accepted
---
# Discover possible correction consumers without changing them

`wi trace <source.md> --heading <heading> --claim <text>` produces a correction review record.
It reads the source passage, Knowledge, and the configured work-item folder.
It reports possible consumers and search gaps. It never repairs, changes status, or claims complete coverage.

## Terms

- A **source passage** is the selected Markdown file and its heading.
- A **linked consumer** contains a link to that source passage.
- A **text candidate** contains the searched claim without a link to the selected passage.
- A **note-only link** points to the source note without naming the selected passage.
- A **search gap** records a skipped, ambiguous, or unsearched part of the search.

## Why

A copied claim can lose its source link. Heading links alone cannot find these older copies.
Text search can find candidates, but cannot establish that a claim is wrong or that every copy was found.
The report therefore keeps evidence and gaps separate from human or agent correction decisions.

A standalone script would duplicate vault selection and shared settings behavior.
The CLI reuses those boundaries and reads settings without building the work-item index.
The scan remains local. Markdown output and JSON output let the caller save a review record separately.

## Boundaries

The source must resolve to a Markdown file inside the vault with the requested heading.
Fenced examples do not establish a source heading. Symbolic scan folders and entries are skipped and reported.
Short wikilinks resolve only when the scanned notes establish one target. Ambiguity becomes a search gap.
Relative Markdown links and encoded heading fragments are supported.
Link and text occurrences are candidates. The caller verifies passage meaning before changing any consumer.
