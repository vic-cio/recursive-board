---
status: accepted
amends: 0054-edits-from-the-file-at-write-time.md (the re-read under the lock is the port's update)
amended_by: 0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md (the coverage test reads the command table)
---
# A storage port and a command runner

Every vault command must exist once, in `src/shared/`, so that `wi` and the plugin's CLI handler
run the same code. The commands read and write files, and `src/shared/` imports nothing from Node.
So a command reaches the vault through a port that each side supplies, and a runner turns a
command line into a reply on any port.

## The decision

- **The port is `StoragePort` in `src/shared/storage.ts`.** Every path is vault-relative, with
  forward slashes; the empty string is the root. The operations are `list` (every file under a
  folder, at any depth, hidden files included, with folders to skip by name), `read`, `exists`,
  `write` (replace), `create` (fails with `PathExistsError` when the path is taken; shared code
  tests it with `isPathExists`, never with a Node error code), `update` (re-read under the lock,
  write what the edit returns when it differs), `rename` (the `.trash` move of `wi rm`), `mkdir`
  (with every missing folder above it), and `withLock(key, fn)`.
- **The index lives in `src/shared/vault.ts`.** `loadVault(port, seams)` builds it, with
  `resolve`, `resolveLink`, `childrenOf`, `isArchived`, `requireAccountedTree`,
  `readRoleTaggedNotes` and `readPeople`. A `WorkItem` has no absolute path: `relPath` is the
  only path, and the `Vault` carries the port it was read from. `editItem(vault, item, plan)` in
  `src/shared/edit-item.ts` is the port's `update` with the 0054 rule. `src/cli/vault.ts` keeps
  what only `wi` needs: `findVaultRoot`, `getDefaultVault`, `wiConfigDir`, and loaders that take
  a root folder and wrap it in the Node port.
- **The Node port is `src/cli/node-port.ts`.** It maps each path onto the root and calls the
  writes in `src/cli/write.ts`: `write` is a temp file and a rename, `create` is a hard link that
  never replaces a file, and a lock is a file in the OS temp folder, keyed by the absolute path as
  before, so a new `wi` and an old one still exclude each other. No vault command module imports
  `node:fs`. `setup`, `doctor` and `update` still do, because they check the machine, not only
  the vault.
- **The Obsidian port is `src/plugin/obsidian-port.ts`.** It reads and writes an indexed file
  through `app.vault` (`read`, `modify`, `create`, `process`), so the metadata cache and open
  editors see the change at once, and a hidden file through `app.vault.adapter`. It imports only
  types from `obsidian`, so `node --test` loads it over the fake in `src/plugin/fake-obsidian.ts`.
- **The runner is `src/shared/runner.ts`.** `createContext` makes a `CommandContext`: the port, an
  environment record, the version, the clock and the chance (`VaultSeams`), the `out` and `err`
  writers, and a vault index that is read on the first call. `RUNNERS` in
  `src/shared/commands/index.ts` maps a command name to a run function that takes the context and
  the parsed `CommandLine`. `runCommand(context, line)` runs it and returns a `Reply` (code,
  stdout, stderr); a usage error or any thrown error becomes exit 2 and `wi: <message>` on
  stderr, as `wi` prints it. The context's writers see each write as it happens, so `wi` prints
  as before. A command reads its environment from the context, never from `process.env`.
- **`wi` runs a registered command through `runCommand`.** It finds the vault root as before,
  builds a Node port on it, and keeps its own switch for every command not yet registered.
  `wi status` is the first registered command, and the pattern for the others.
- **A contract test holds the two ports together.** `src/cli/contract.test.ts` runs each case
  through `runCommand` on the Node port over a temp vault and on the Obsidian port over the fake,
  with a fixed clock and chance, and compares the reply and every file byte for byte. A coverage
  test fails when a command in the command table that is not an install command has no case
  ([0080](0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md)).

## How the Obsidian port differs

- **Locks are in-process.** `withLock` is a queue per key in the plugin's process. It orders the
  plugin's own commands, and cannot exclude a `wi` process or another device. The board's own
  writes keep their queue in `main.ts`; they do not share the port's.
- **A write is Obsidian's write.** `modify` and `adapter.write` replace a file the way Obsidian
  does, which is not always a temp file and a rename. `update` uses `process`, Obsidian's
  read-modify-write, so an edit in an open editor between the read and the write is not lost.
- **`create` checks and creates under the lock.** Obsidian has no create that fails atomically on
  a taken path across processes, so the check excludes only the plugin's own commands. A `wi`
  process can still win the same path in the gap; `vault.create` then fails, and nothing is
  overwritten.

## Rejected

- **Pass a filesystem-like object with Node's signatures.** Shared code would test Node error
  codes and absolute paths, which the plugin cannot give.
- **Keep `item.path` absolute.** Only the Node port knows a root folder. A command that needs a
  file names it by `relPath` and asks the port.
- **A port without `update`.** `withLock`, `read` and `write` can do the same on Node, but in
  Obsidian they would lose an editor's change made between the read and the write.
