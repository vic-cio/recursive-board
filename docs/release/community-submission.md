# Community directory check for 1.0.0

Checked on 2026-10-09 against the Obsidian developer docs (Community directory section) and the
obsidianmd/obsidian-releases README.

## Status: already listed

Recursive Board is already in the Obsidian Community directory:
<https://community.obsidian.md/plugins/recursive-board>. The listing shows 85 downloads and
"Add to Obsidian". Victor submitted it through the form at community.obsidian.md.

The directory no longer takes pull requests. On 2026-05-15, obsidian-releases removed its
submission instructions "in favor of new system". `community-plugins.json` in that repo is now a
mirror of the directory, and its pull request template for plugins is gone.

So 1.0.0 needs no submission and no pull request. To publish 1.0.0 in the directory:

1. Bump the version and push the tag `1.0.0`, as `AGENTS.md` (Release) says.
2. Let the tag workflow create the GitHub release with `main.js`, `manifest.json` and `styles.css`.
3. Wait for the directory to find the release, or select **... → Check for new releases** on the
   entry page at community.obsidian.md.

Optional, before the tag: on the entry page, select **Review branch** and run a preview scan on the
release branch. Only Victor can do this, because it needs his Obsidian account.

## community-plugins.json entry

This is the entry that the mirror holds now. Nobody writes it by hand.

```json
{
  "id": "recursive-board",
  "name": "Recursive Board",
  "author": "Victor Ciobanu",
  "description": "Renders a work item's children as a board or a checklist, from frontmatter alone. - This plugin has not been manually reviewed by Obsidian staff.",
  "repo": "vic-cio/recursive-board"
}
```

The directory takes `author` from the Obsidian account, not from `manifest.json` (`vic-cio`). It
adds the "not manually reviewed" suffix itself.

## Pull request text

None. The submission form at community.obsidian.md replaces the pull request, and the entry is
already submitted.

## Rules

| Rule | Result | Evidence |
| --- | --- | --- |
| `README.md`, `LICENSE` and `manifest.json` in the repo root | Pass | All three exist. |
| Licence recognised by GitHub | Pass | GitHub reports `MIT`. The copyright line names `vic-cio`, 2026. |
| Manifest has `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `isDesktopOnly` | Pass | All present with the correct types. No keys outside the schema. |
| `id` uses lowercase letters and hyphens, has no "obsidian", does not end in "plugin" | Pass | `recursive-board`. |
| `name` has no "Obsidian" or "Plugin", and uses Basic Latin | Pass | `Recursive Board`. |
| `version` is `x.y.z`, and the release tag equals it | Pass | `release.yml` fails when the tag differs from `manifest.json` or `package.json`. Tags have no `v`. |
| `versions.json` maps each version to `minAppVersion` | Pass | `release.yml` checks the tag's entry. |
| `minAppVersion` is a real Obsidian version | Pass | `1.13.4` is an Obsidian release. |
| Description: at most 250 characters, starts with a verb, ends with a period, no emoji | Pass | 81 characters, "Renders ...". |
| `fundingUrl` only for financial support | Pass | No `fundingUrl`. |
| `isDesktopOnly` is `true` when the plugin uses Node or Electron | Pass | `false`. The plugin bundle has no Node imports: `build/forbidden-imports.mjs` and `src/plugin/ios-safety.test.ts` hold this. |
| Release has `main.js`, `manifest.json` and `styles.css` as assets | Pass | `release.yml` attaches the three files from `dist/`. 0.9.0 has them. |
| The build reproduces the release `main.js` | Pass | The 0.9.0 scan: "Build reproduced the release main.js byte-for-byte". The scanner runs `npm run build`. |
| Release assets carry a build attestation | Pass | `release.yml` attests the three files. The scan verified them. |
| Command IDs do not contain the plugin ID; no default hotkeys | Pass | IDs such as `open-work-item`. No `hotkeys`. |
| No sample code or sample class names | Pass | The local lint run found none. |
| No obfuscation, ads, client telemetry or self-update | Pass | The scan found no obfuscation and no suspicious network use. |
| README discloses network use and files outside the vault | Pass | The plugin uses no network and reads only the vault. `wi` is a separate CLI. |
| No `innerHTML`, `outerHTML` or `insertAdjacentHTML`; no global `app` | Pass | None in `src/plugin` or `src/shared`. |

## Scanner findings that do not block

The scan of 0.9.0 rates **Review: Caution**, with 60 issues: 18 medium groups and 2 info groups,
none high. Health is **Excellent**. Warnings do not block a listing.

The scanner ignores only a fixed list of paths (`test`, `scripts`, `docs`, `build`, `*.test.*` and
some others). It scans `src/cli/`, which is the Node CLI, as plugin code. Almost all findings come
from there:

- `src/cli/`: Node built-in imports (`node:fs`, `node:path`, `node:os`, `node:url`,
  `node:child_process`, `node:util`, `node:crypto` and others), `fetch` in `doctor.ts`, hardcoded
  `.obsidian` paths, unused imports, and three typescript-eslint type findings.
- `src/shared/frontmatter.ts:183` and `:205`: control characters in a regular expression.
- `src/shared/board-settings.ts:10`: a hardcoded `.obsidian` path.
- `src/plugin/styles.css:503` and `:507`: `text-decoration` is only partly supported.

A local run of `eslint-plugin-obsidianmd` 0.4.2 (the rules the scanner uses) also reports these in
`src/plugin`:

- `settings.ts:106`, `108`, `128`, `151`: HTML heading elements in the settings tab. The rule asks
  for `new Setting(containerEl).setName(...).setHeading()`. The live scan did not list this.
- Sentence case warnings in `main.ts`, `settings.ts`, `ui/open-modal.ts` and
  `ui/send-for-review-modal.ts`.
- `settings.ts`: `display()` is deprecated from Obsidian 1.13. The rule suggests
  `getSettingDefinitions()` and `this.update()`.

This branch changes no file in `src/`. The release card decides whether to fix any of these.
