# Community directory audit

Audited against Obsidian's [Plugin guidelines](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/master/en/Plugins/Releasing/Plugin%20guidelines.md), [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [Manifest reference](https://docs.obsidian.md/Reference/Manifest), [Developer policies](https://docs.obsidian.md/community-directory/developer-policies), and [submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin). The public [directory repository](https://github.com/obsidianmd/obsidian-releases) and an [archived validation workflow run](https://github.com/obsidianmd/obsidian-releases/actions/runs/23481036725/workflow?pr=11346) informed the automated-check section. The current directory's server-side scanner cannot be run locally.

**Status key:** Pass means the checked code or artifact already met the rule. Fixed means this audit changed it. Not fixed means a deliberate exception or remaining release task, with its reason below.

## Plugin guidelines

| Guideline checked | Status | Evidence or reason |
| --- | --- | --- |
| Avoid global `app` and `window.app` | Pass | Plugin code uses the instance's `app` reference and passes it into helpers. |
| Avoid unnecessary console logging | Pass | No runtime `console.log` or debug logging in `src/plugin/`. |
| Organize multiple source files and rename sample placeholders | Pass | Plugin code is split by action, index, mounting, and UI; no sample classes remain. |
| Keep Node.js and Electron APIs out of mobile builds | Pass | Runtime modules import neither; `tsconfig.plugin.json`, the forbidden-import build check, and `ios-safety.test.ts` guard the bundle. |
| Avoid regex lookbehind on older iOS | Pass | No runtime regex lookbehind. |
| Use settings headings only for multiple sections; omit “settings” from headings; use `Setting.setHeading` | Pass | The plugin has no settings tab or settings headings. |
| Use sentence case in UI text | Fixed | “Copy ID” and the copy failure notice were corrected; status labels now have sentence-case text in the DOM. |
| Avoid `innerHTML`, `outerHTML`, and `insertAdjacentHTML` with dynamic content | Pass | No runtime use. Text is placed with Obsidian DOM helpers; the generated checklist goes through `MarkdownRenderer.render`. |
| Clean up events, timers, rendered components, and DOM on unload | Fixed | Events use `registerEvent`; the pending timeout is cleared; mounted regions and overlays are removed; checklist renderer components and session maps are released. Late layout and card-render callbacks are guarded. |
| Do not detach leaves in `onunload` | Pass | Unload only removes plugin-owned DOM. |
| Do not assign default hotkeys | Pass | Commands supply no `hotkeys` field. |
| Use the right command callback type | Pass | Context-dependent commands use `checkCallback`; unconditional undo uses `callback`. |
| Avoid direct `workspace.activeLeaf` | Pass | Commands use `getActiveViewOfType(MarkdownView)`. |
| Avoid holding custom view references | Pass | The plugin registers no custom view and looks up Markdown leaves as needed. |
| Prefer Editor API over `Vault.modify` for active edits | Pass | No active note is changed with `Vault.modify`. Frontmatter changes use `Vault.process`; the exact-text undo now also uses `Vault.process` atomically. |
| Prefer `Vault.process` for background edits | Fixed | Normal edits already used it; undo restoration now does too. |
| Prefer `FileManager.processFrontMatter` | Not fixed | The accepted [line-wise frontmatter decision](adr/0005-line-wise-frontmatter.md) requires untouched bytes and unknown keys to survive. `processFrontMatter` serializes YAML and would break that guarantee. The plugin uses `Vault.process` around the shared line editor instead. |
| Prefer Vault/FileManager over Adapter | Fixed | Work items use Vault/FileManager. Config reads try Vault first, then Adapter for the hidden `.wi.json` file, which may not be indexed by Vault; [Vault documentation](https://docs.obsidian.md/Plugins/Vault) reserves Adapter for hidden files. |
| Avoid scanning all files merely to find one path | Pass | Path lookups use `getFileByPath` or `getAbstractFileByPath`. The index scans Markdown files to build the board, which is its actual task. |
| Use `normalizePath` for user-defined and constructed vault paths | Fixed | The configured work-item folder and new child path are normalized at the plugin boundary. The shared config parser still rejects traversal and invalid paths before normalization. |
| Reconfigure registered editor extensions through `updateOptions` | Pass | No editor extension is registered. |
| Use CSS classes and theme variables instead of hard-coded JS styles | Pass | UI elements use `wi-*` classes and scoped CSS. The sole JS style assignment sets a CSS custom property from Obsidian's measured mobile header padding; it is a runtime measurement, not a fixed color or size. |
| Avoid overriding core styles | Not fixed | Two CSS rules adjust editor content sizing only inside `.wi-region-host` so the generated checklist follows the note without a blank viewport; see [the rendering decision](adr/0020-generated-markdown-and-note-view.md). They do not apply to other notes. |
| Prefer `const`/`let` and `async`/`await` | Pass | Runtime code has no `var`; asynchronous file actions use `async`/`await`. |

## Additional official checklist and submission requirements

| Check | Status | Evidence or reason |
| --- | --- | --- |
| No hard-coded configuration-directory path | Pass | Runtime code never constructs `.obsidian`; the README uses that directory only to explain manual installation. |
| No unchecked `FileSystemAdapter` cast, `process.platform`, or direct `fetch` | Pass | None occurs in runtime code. |
| No bundled `moment` copy or deprecated Markdown renderer call | Pass | Neither is used; the plugin calls `MarkdownRenderer.render`. |
| Minified release bundle and delayed initial UI | Pass | `build/plugin.mjs` minifies production output; initial mount runs through `workspace.onLayoutReady`. |
| Lockfile committed; `main.js` kept out of source | Pass | `package-lock.json` is present; `dist/` is ignored. |
| Funding URL only for financial support | Pass | No `fundingUrl` is set. |
| Appropriate minimum app version | Fixed | `minAppVersion` is 1.13.4, the [first public 1.13 release](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/). Published API types for 1.12.0 give `FileManager.promptForDeletion` a `Promise<void>` result; 1.13.0 gives it the `Promise<boolean>` result used here. The previous 1.5.0 was too low. |
| Short, clear description | Pass | 81 characters, starts with “Renders,” has no “Obsidian” or emoji, and ends with a period. |
| Desktop-only flag matches imports | Pass | `isDesktopOnly: false` matches the browser-only runtime bundle and iOS safety checks. |
| Command IDs omit plugin ID; command names omit plugin name | Pass | IDs are local verbs and names omit the full plugin name. |
| Remove sample code | Pass | No sample plugin commands, settings, or placeholder classes remain. |
| Manifest required fields and semantic version | Pass | ID, name, version, minAppVersion, description, author, and isDesktopOnly are present; version is `x.y.z`. |
| Optional `authorUrl` and `fundingUrl` | Pass | Both are optional and omitted; no destination was invented. |
| Plugin ID allowed by manifest rules | Not fixed | The current ID contains the reserved word “obsidian.” The task explicitly reserves the rename for another agent, so this audit does not change it. |
| Name allowed by manifest rules | Pass | The short name contains neither “Obsidian” nor “Plugin.” Directory-wide uniqueness is checked at submission. |
| LICENSE and user-facing README | Fixed | LICENSE was present. README already explained purpose and use; installation instructions now cover directory installation and a manual pre-listing release without assuming a folder name that differs from the manifest. |

## Developer policies and automated review

| Check | Status | Evidence or reason |
| --- | --- | --- |
| No obfuscation, dynamic ads, client telemetry, or self-install/update | Pass | Source is readable; the production bundle is minified only. No runtime network, tracking, ad, or updater code exists. |
| Disclose payments, account use, network use, external file access, ads, server telemetry, or closed source when applicable | Pass | None applies to the plugin. The README describes local vault use and optional sync clients. |
| License, attribution, and trademark | Pass | MIT LICENSE is present; no third-party plugin code is bundled; the name does not imply a first-party plugin. |
| Fork policy | Pass | The repository is not presented as a fork. |
| Bot: ID syntax, reserved terms, name, and license | Not fixed | Name and license pass locally; the ID's reserved term remains for the separate rename. |
| Bot: root manifest and matching GitHub release assets/tag | Not fixed | `manifest.json` currently lives in `src/plugin/` and the build emits all three installable files under `dist/`. Before submission, release preparation must put the final manifest at the repository root and publish `main.js`, `manifest.json`, and `styles.css` under a tag matching its version. Doing this after the reserved ID rename avoids two conflicting manifests. |
| Bot: repository owner, issues setting, entry metadata, and release availability | Not fixed | These are GitHub submission checks. This worktree has no remote and no submission or release; they cannot be verified locally. |

## Verification

- `npm ci` completed before edits.
- `npm test` and `npm run build` pass.
- Source scans found no dynamic HTML insertion, default hotkeys, global app use, Node/Electron runtime import, or leaf detachment.
- The fixture was generated and the built plugin linked into it. The installed Obsidian app is 1.6.7, below the required 1.13.4. An isolated instance opened its welcome screen, but desktop automation could not open the fixture (`window_not_found` on clicks). No vault was opened, so visual rendering remains unverified on a compatible app.

The remaining release tasks are the reserved ID rename, a final root manifest, and a matching public release. The current automated scanner's private checks may request additional changes after submission.
