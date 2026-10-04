/**
 * Reading CHANGELOG.md: its `## [<version>]` sections and their `### Agent setup` parts.
 *
 * `wi update` prints the Agent setup parts of the versions it installed. The format is Keep a
 * Changelog, as CHANGELOG.md says. This module imports nothing from Node, so the plugin may read
 * the same text.
 */

export interface ChangelogSection {
  /** A version such as `0.8.3`, or `Unreleased`. */
  version: string
  text: string
}

function lines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

/** Each `## [<version>]` section, newest first as the file has them. */
export function changelogSections(text: string): ChangelogSection[] {
  const sections: ChangelogSection[] = []
  let current: { version: string; body: string[] } | null = null
  const close = () => {
    if (current) sections.push({ version: current.version, text: current.body.join('\n').trim() })
  }
  for (const line of lines(text)) {
    if (/^## /.test(line)) {
      close()
      const version = /^## \[([^\]]+)\]/.exec(line)?.[1]
      current = version ? { version, body: [] } : null
    } else if (/^\[[^\]]+\]: /.test(line)) {
      // A compare link at the end of the file.
      close()
      current = null
    } else if (current) {
      current.body.push(line)
    }
  }
  close()
  return sections
}

/** The `### Agent setup` part of one section's text, or null when the section has none. */
export function agentSetupPart(sectionText: string): string | null {
  const all = lines(sectionText)
  const start = all.findIndex((line) => /^### Agent setup\s*$/.test(line))
  if (start === -1) return null
  const rest = all.slice(start + 1)
  const end = rest.findIndex((line) => /^#{1,3} /.test(line))
  const part = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return part === '' ? null : part
}

/** The numeric parts of a version such as `0.8.3`, or null for any other text. */
function parts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  return match ? match.slice(1).map(Number) : null
}

/** Below zero when `a` is older than `b`, zero when they are equal, above zero when newer. */
export function compareVersions(a: string, b: string): number {
  const left = parts(a)
  const right = parts(b)
  if (!left || !right) throw new Error(`cannot compare versions "${a}" and "${b}".`)
  for (let i = 0; i < 3; i++) {
    const difference = left[i]! - right[i]!
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * The Agent setup parts of the released versions newer than `after`, up to and including `upTo`,
 * newest first. The Unreleased section is left out: an installed package has released versions only.
 */
export function agentSetupSince(text: string, after: string, upTo: string): ChangelogSection[] {
  const found: ChangelogSection[] = []
  for (const section of changelogSections(text)) {
    if (parts(section.version) === null) continue
    if (compareVersions(section.version, after) <= 0 || compareVersions(section.version, upTo) > 0) continue
    const part = agentSetupPart(section.text)
    if (part !== null) found.push({ version: section.version, text: part })
  }
  return found
}
