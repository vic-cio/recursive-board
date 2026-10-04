/**
 * Reading the marked blocks of docs/playbook.md.
 *
 * The marker grammar is docs/adr/0067-the-playbook-ships-with-marked-blocks.md. `wi setup` prints
 * the summary, and the agent setup checks compare a vault with the other blocks. Both writers read
 * the same text, so the parser lives here and imports nothing from Node.
 */

export interface PlaybookCheck {
  id: string
  text: string
}

export interface PlaybookChange {
  /** A version such as `0.8.3`, or `Unreleased`. */
  version: string
  text: string
}

const OPEN = /^(`{3,}|~{3,})(.*)$/
const MARKER = /(?:^|\s)playbook=([a-z][a-z-]*)(?:\s|$)/
const CHECK = /^([a-z][a-z-]*) {2,}(\S.*)$/

function lines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

/** Each marked block by its name, in file order. The first block wins when a name repeats. */
export function playbookBlocks(text: string): Map<string, string> {
  const found = new Map<string, string>()
  const all = lines(text)
  for (let i = 0; i < all.length; i++) {
    const open = OPEN.exec(all[i]!)
    if (!open) continue
    const fence = open[1]!
    let end = -1
    for (let j = i + 1; j < all.length; j++) {
      const line = all[j]!.trimEnd()
      if (line[0] === fence[0] && /^(`+|~+)$/.test(line) && line.length >= fence.length) {
        end = j
        break
      }
    }
    if (end === -1) break
    const name = MARKER.exec(open[2]!)?.[1]
    if (name && !found.has(name)) found.set(name, all.slice(i + 1, end).join('\n'))
    i = end
  }
  return found
}

/** The text of one marked block, or null when the playbook does not mark it. */
export function playbookBlock(text: string, name: string): string | null {
  return playbookBlocks(text).get(name) ?? null
}

/** The lines of the `checks` block, each as an id and its text. */
export function playbookChecks(text: string): PlaybookCheck[] {
  const block = playbookBlock(text, 'checks')
  if (block === null) return []
  const checks: PlaybookCheck[] = []
  for (const line of block.split('\n')) {
    const match = CHECK.exec(line)
    if (match) checks.push({ id: match[1]!, text: match[2]!.trim() })
  }
  return checks
}

/** The `### <version>` entries of the `## Changes` section, newest first as the file has them. */
export function playbookChanges(text: string): PlaybookChange[] {
  const all = lines(text)
  const start = all.findIndex((line) => /^## Changes\s*$/.test(line))
  if (start === -1) return []
  const changes: PlaybookChange[] = []
  let current: { version: string; body: string[] } | null = null
  const close = () => {
    if (current) changes.push({ version: current.version, text: current.body.join('\n').trim() })
  }
  for (const line of all.slice(start + 1)) {
    if (/^## /.test(line)) break
    const heading = /^### (.+?)\s*$/.exec(line)
    if (heading) {
      close()
      current = { version: heading[1]!, body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  close()
  return changes
}
