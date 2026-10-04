/**
 * The agent playbook, bundled into main.js as text.
 *
 * The plugin cannot reach the npm package, so the build inlines docs/playbook.md. Read its blocks
 * with src/shared/playbook.ts, as `wi` does with the installed copy.
 */
import playbook from '../../docs/playbook.md'

export const PLAYBOOK: string = playbook
