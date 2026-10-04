---
status: accepted
---
# wi update updates wi, the skill and the plugin together

A user has three copies of Recursive Board on a machine: the `wi` package, two skill copies, and
the plugin in the default vault. Before this command, each had its own update step, and a missed
step left an agent reading an old skill or a vault running an old plugin. `wi update` does the
four steps in one command, and reports each one. `--dry-run` writes nothing, and `--json` prints
one report.

1. **Install.** Ask npm for the `latest` version. When it is newer, run
   `npm install --global recursive-board@<version>`.
2. **Skill.** Replace both skill copies, as `wi setup` installs them.
3. **Plugin.** Replace `main.js`, `manifest.json` and `styles.css` in the vault's plugin folder
   with the files from the same package. Then say to reload Obsidian, and to force-quit and open
   it again on the phone.
4. **Changes.** Print the `### Agent setup` parts of the `CHANGELOG.md` versions after the old
   version, up to the new one, and suggest `wi doctor`.

## The decision

- **The new `wi` runs steps 2 to 4.** The running `wi` is the old code. After step 1, it runs the
  newly installed `wi` as `wi update --from <old version>`, with the same `--json` and `--vault`
  flags. So the skill, the plugin build and the changelog come from the new package,
  and the new code's rules apply to them. `--from` skips the install, and the old `wi` uses it to
  hand over. A person can also use it to finish an update that stopped after step 1. With
  `--json`, the old `wi` captures the new report and prints one document with all four steps.
- **The package ships the plugin build.** `package.json` lists `dist/main.js`,
  `dist/manifest.json` and `dist/styles.css` in `files`, and `prepack` runs `npm run build`, so
  a published package always carries a plugin build of its own version.
- **A version that is already current installs nothing, and still refreshes the copies.** Steps 2
  and 3 compare each file with the package and write only the files that differ. A copy that is
  already current is left as it is. The command asks no question, so an agent or a script can run
  it. Run `--dry-run` first to see what it would replace.
- **A symlinked development install stays.** A skill copy that is a symlink, a plugin folder that
  is a symlink, or a plugin folder with a symlinked file is a development install. `wi update`
  reports it and writes nothing through it, as `wi setup` does with the skill.
- **A skill folder that `wi setup` did not make stays.** Without the marker file, the folder can
  hold the user's own files. `wi update` reports it, names `wi setup --force`, and goes on.
- **A missing plugin folder is reported, and not created.** The plugin files are the tool's own
  files, so `wi update` replaces them where they are. To create the folder is to install a plugin
  in the vault, and that is the user's choice, made in Obsidian. A synced vault would also copy
  the new folder to every device. The report names the folder, and says how to install the
  plugin: from Community plugins once it is listed there, or by a copy of the three files.
- **A source checkout skips npm and the plugin.** When `wi` runs from a Git checkout, step 1 says
  to update with Git, and step 3 says to run `npm run build` and `npm run install:vault`. The
  checkout's `dist/` can be older than its source, and a copy would ship a stale bundle. Step 2
  still runs, and a linked skill stays.
- **The vault is found as other commands find it** (0059): `--vault`, `WI_VAULT`, the vault
  around the current folder, then the default vault in the user config. With none, step 3 says
  how to name one.
- **Each plugin file is replaced whole.** `wi update` writes a temporary file in the plugin
  folder, then renames it over the old file. Obsidian and a sync client never see half a file.
  `data.json`, which holds the plugin settings, is not touched.
- **Every outside effect goes through one seam.** npm, the new `wi` process, the home folder, the
  environment and the output are fields of `UpdateSeams`. The tests use temp folders and a fake
  npm, and never run a real install.

## The plugin side

AGENTS.md asks for a plugin feature for each command. For `wi update`, Obsidian's own plugin
updater is that feature, once the plugin is in the Community plugins directory. Then Obsidian
updates the plugin, and step 3 stops: a later release removes the copy and makes step 3 say to
update the plugin in Obsidian. The command keeps working, so no user workflow breaks. Steps 1, 2
and 4 change files outside the vault, which the plugin cannot reach on every platform.

## Rejected

- **Run all four steps in the old `wi`.** The old code would copy the old package's skill and
  plugin, or read the new package's files with rules that do not know them.
- **Import the new package's code into the running process.** Two versions of one module in one
  process can mix their state. A separate process is simpler, and it is what a user would run.
- **Ask before a refresh at the current version.** A question blocks an agent or a script, and
  the refresh writes only the files that differ.
- **Create a missing plugin folder.** See the decision above.
