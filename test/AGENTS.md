# Agent Instructions

## Canonical data

Work items are Markdown files in the work-item folder set by `.wi.json`. These files are canonical.
The plugin is a view, not a database. Do not create a second task store.

## Work-item schema

A work item has YAML frontmatter with these required fields:

```yaml
type: work-item
id: wi-a7f3
title: Build a feature
status: doing
parent: "[[Main]]"
created: 2026-09-21
updated: 2026-09-22
```

Roots have no `parent` or `status`. Optional fields include `owner`, `agent`, `priority`, `due`,
`blocked`, `depends_on`, `tags`, `board`, and `prev_status`. Preserve unknown frontmatter keys.
Change only the key you mean to change.

## Status

The valid statuses are `backlog`, `options`, `doing`, and `done`. A root has no status.
`prev_status` stores the status to restore when an item is unticked from done.

A dispatcher assigns a card with `wi claim <ref> --agent <name>`. The command records the agent
and doing status in one file write. If that worker stops, its dispatcher runs `wi release` with
`--reason <text>` and optionally `--where <branch-or-path>`. Release clears the agent, returns
the card to options, and adds a dated line to Notes so the next worker can continue.

## Identity

Every work item has a stable `id`. Parent links use wikilinks. The wikilink determines parent
resolution; the id supports recovery. If they disagree, report the mismatch and do not silently
repair either value.

## Parent and child

A child stores its parent link. A parent stores no duplicate child state. Changing status edits the
child's `status`; moving an item edits its `parent`. Use `wi move <ref> --to <ref>` so the command
can prevent loops and keep the item's children attached. Do not rewrite the parent when changing a
child.

## Integrity

1. An item has at most one parent.
2. Status is one of the four valid values, or absent on a root.
3. Parent links must form an acyclic tree.
4. Report a missing parent. Keep the child; do not delete it.
5. Make minimal frontmatter edits.
6. Preserve human-authored body content.
7. Keep each work-item file directly in the configured work-item folder.

## Removing work items

Use `wi rm`, which moves files to `.trash` so a mistaken removal can be recovered.

```bash
wi rm <ref>                         # an item with no children
wi rm <ref> --recursive             # the item and all descendants
wi rm <ref> --recursive --dry-run   # preview without changing files
```

Never orphan children. If an item has children, remove the subtree with `--recursive` or move the
children first with `wi move`. Run `--dry-run` before removing anything you did not create in this
session. A root cannot be removed.

## Safety

Bulk edits can lose data. Check the scope before running a command that changes several files. Do
not move or rename groups of work items. Renaming can break parent wikilinks.
