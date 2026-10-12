# Vault configuration

Set the board settings in **Settings → Recursive Board → Board**. The section sets the card folder, the default parent (`defaultRoot`), the extra sections (one chip per heading), and first-child promotion. The people list and **Your name** are under **People**. The agent limit is under **Dispatcher**.

The plugin stores the board settings under the `board` key of its data file, `.obsidian/plugins/recursive-board/data.json`. `wi` reads that file and never writes it:

```json
{
  "board": {
    "workItemFolder": "Boards",
    "defaultRoot": "Project",
    "extraSections": ["References", "Risks"],
    "maxAgents": 3,
    "autoPromote": true,
    "people": ["Ana", "Victor"]
  }
}
```

`workItemFolder` is a vault-relative folder path. It defaults to `Boards`. In the settings tab, **Rename** renames the folder with all its cards in one step. Links name files, not folders, so they keep working. If a folder with the new name exists, the board reads that folder and moves nothing. `defaultRoot` is a root filename stem. It defaults to `null`, so `wi new` needs an explicit `--parent`. `extraSections` lists non-empty, single-line headings. Each heading follows the built-in sections, empty like them. These settings apply to `wi new` and plugin item creation. Invalid values stop config loading.

`maxAgents` is a non-negative whole number or `null` for no limit. `WI_MAX_AGENTS` overrides it for one CLI run. `wi agents` reports the limit and the active agents. One agent counts once when it holds a card and its subtask. An agent whose doing card only waits on its children, because every open child is in doing, does not count. Nor does an agent whose doing card waits on a person, which is a review. The limit is advisory. `wi claim` can exceed it.

Obsidian Sync carries the plugin data file only when **Installed community plugins** sync is on for the device. Turn it on for each device. A device without the `board` key uses the defaults and shows a notice once. [Read the Obsidian Sync settings](https://obsidian.md/help/sync/settings).

`autoPromote` is `true` or `false`. It defaults to `true`. When `wi new` or the board's add row gives a card its first child, it also sets `board: true` on that card, so the children show as a board. It never changes a root, an area, a card that already has children, or a card that has a `board` key. Undoing an add in Obsidian also restores the parent when the add promoted it.

## People

`people` lists the people who review cards and take them. A card can wait on a person, which is a review, and a person can be an assignee. In **People**, type a name and select **Add**, or select **×** on a name to remove it. A name is one line, has no `[`, `]` or `|`, and is not `agent`, the reserved name for any agent. Names are unique, compared without case. The key is absent when the list is empty. `wi depend --on <name>` and `wi assign --to <name>` look up the name here without case, and write the list's spelling. They refuse a name that is not a person, and say to add the person here.

A note with `type: person`, in any folder, also counts as a person, so a vault from before the list keeps working. No person needs a note, and the plugin makes none. **People** shows each person note that the list does not name as a **+ Name** button, which adds it in one click. When a name is in both, the list's spelling wins.

**Your name** says who you are on this device. Its choices are the names in the list. The plugin keeps it in Obsidian's local storage for the vault, so it does not sync, and each device sets its own. With no choice made, it is the list name that equals the Obsidian account name, when Obsidian gives the plugin that name. Select **None** to have no name. With Your name set, **Assign to…** in the card menu lists **Assign to me** first, **Waits on…** lists you first, and a card that waits on you reads "Waits on you".

## Where `wi` finds the vault

`wi setup` writes the selected vault to the user config at `$XDG_CONFIG_HOME/wi/config.json`, or `~/.config/wi/config.json` when `XDG_CONFIG_HOME` is unset. The format is `{"defaultVault":"/absolute/path/to/vault"}`. Vault detection uses Obsidian's registry on macOS, Linux, and Windows. `--vault <path>` selects a vault directly, and `--yes --vault <path>` runs without prompts.

`wi` finds the vault from `--vault <path>`, then `$WI_VAULT`, then the vault the current folder is in (the nearest folder with the plugin data file or `Boards/`), then `defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`).
