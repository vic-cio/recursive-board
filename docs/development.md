# Development

Requirements: Node.js 23.6 or later and npm. The tests run the TypeScript source directly, which needs type stripping. The built `wi` runs on Node.js 20.12 or later.

```sh
npm install
npm test
npm run build
npm run fixture
npm run fixture -- --review --vault <path>
```

`npm test` typechecks the CLI and plugin, then runs the test suite. `npm run build` builds the plugin and CLI. `npm run fixture` generates the development vault fixture in `test/Boards/`. That fixture is deliberately invalid: it has an orphan and an unknown key, to test the validator.

`npm run fixture -- --review --vault <path>` writes a clean review set into the vault at `<path>`, so you can check the board UI by eye. The set has 25 work items and the people notes `People/Victor.md` and `People/Sam.md`. Each card's title says what to look at: each kind of chip, waits on a card and on a person, one, two and any-agent assignees, a long title, several labels, an area with children, and done cards. `wi validate` reports 0 errors and 0 warnings. The mode needs `--vault`, because it has no default. It refuses a path with no `.obsidian` folder. It replaces only what it wrote before: its own cards and the two people notes. It stops, and deletes nothing, when `Boards/` holds a work item that is not in the set or under its `Test board` root. It also stops when `People/Victor.md` or `People/Sam.md` holds other text. Run it again to reset the vault.
