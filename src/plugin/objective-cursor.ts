/**
 * Where the cursor goes when a card opens. A new card's body starts with an empty Objective, and
 * Obsidian puts the cursor on the first body line, which is that heading. Pure, so it is tested
 * without Obsidian.
 */

/** The 0-based line under an empty `## Objective`, or null when Objective has text or is missing. */
export function emptyObjectiveLine(text: string): number | null {
  const lines = text.split(/\r?\n/)
  const heading = lines.findIndex((line) => /^##\s+Objective\s*$/.test(line))
  if (heading < 0) return null
  for (let i = heading + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i]!)) break
    if (lines[i]!.trim() !== '') return null
  }
  return lines[heading + 1]?.trim() === '' ? heading + 1 : null
}
