# Board-open benchmark

Run `npm run bench` from the repository root. The script creates synthetic vaults under the OS temporary directory, measures them, and removes them. It does not run in `npm test` and never touches a real vault. To inspect a generated vault, run `node scripts/bench-fixture.ts [N]`; it defaults to 1,000 cards, prints the temporary path, and leaves cleanup to the caller.

## Machine and method

Measured on 2026-09-23 with Node v26.5.0, macOS Darwin 27.0.0, Apple M1, 8 logical CPUs, and 8.0 GiB RAM. Each value is the median / interpolated p95 in milliseconds from 15 measured runs after 2 warmups. Runs execute sequentially on one machine; they are not a cross-device guarantee.

N counts child cards, plus one root file. About 70% of the cards sit directly on the root board. The others are divided among four promoted boards and deeper descendants. Files have the canonical work-item fields, mixed statuses, priorities, owners, labels, blockers, dates, and short Objective, Context, Acceptance Criteria, and Notes sections. The generated vault validates with zero errors and warnings.

The plugin normally reads frontmatter from Obsidian's metadata cache. The benchmark times filesystem reads and the shared frontmatter parser **separately** as an approximation of cache population, then feeds parsed values into a small Obsidian cache adapter. The index measurement constructs a fresh `WorkItemIndex` and triggers its full rebuild, including parent resolution, child maps, archive state, and sibling sorting. Grouping calls `toColumns` on the root's direct children. Markdown generation calls `checklistMarkdown` on those children, even though desktop boards draw cards as DOM elements; this measures the pure list-generation path used by checklists and grouped mobile views. The two `wi` measurements spawn a fresh Node process for every run and include startup, vault loading, command work, and output formatting. Output goes to the OS null sink.

| Cards | Read files | Parse frontmatter | Rebuild index/tree | Group root board | Checklist Markdown | `wi children --tree` | `wi validate` | Root children |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 4.98 / 6.30 | 0.81 / 1.27 | 0.38 / 0.50 | 0.02 / 0.05 | 0.07 / 0.09 | 168.14 / 175.82 | 167.71 / 170.12 | 70 |
| 1,000 | 29.74 / 50.72 | 5.15 / 7.45 | 1.56 / 1.90 | 0.09 / 0.11 | 0.34 / 0.34 | 284.92 / 299.71 | 290.24 / 311.35 | 700 |
| 5,000 | 194.12 / 288.87 | 16.99 / 19.11 | 7.22 / 7.97 | 0.37 / 0.40 | 1.26 / 1.54 | 825.24 / 1074.59 | 817.67 / 1192.47 | 3,500 |

## Where the time goes

At 1,000 cards, reading all 1,001 files is the largest measured preparation step at 29.74 ms median. Parsing their frontmatter takes 5.15 ms. Once metadata is in memory, a fresh plugin index takes 1.56 ms, status grouping takes 0.09 ms, and generating a 700-row checklist string takes 0.34 ms. A clean board open can reuse an already built index, so the index rebuild is a conservative measurement of that part of opening.

The CLI commands take hundreds of milliseconds because each invocation starts Node and reads the vault anew. They are separate from the plugin open path. At 5,000 cards, both commands are around 0.82 seconds median; this benchmark does not isolate their startup, disk, validation, or output costs further.

**The actual board-open latency remains unmeasured.** Node cannot run Obsidian's metadata cache, Markdown renderer, or DOM creation and layout. In particular, a desktop root board would create 700 card elements at N = 1,000. This result shows that the measured in-memory tree and grouping work is small; it does not establish that the visible board opens quickly in Obsidian.

## Changes to consider if opening is slow

1. **Render only visible cards on very wide boards.** The unmeasured DOM work scales with the 700 direct children at N = 1,000 and 3,500 at N = 5,000. Windowing the card stack is the most plausible way to reduce initial element creation and layout. First profile an actual Obsidian open to confirm that rendering dominates.
2. **Update the index incrementally after a single file change.** A full rebuild is only 1.56 ms median at N = 1,000, so this is lower priority. It would matter if Obsidian profiles show repeated invalidations during opening or syncing. Preserve parent-link resolution and archive inheritance when changing this path.

No production code was changed based on these Node results.
