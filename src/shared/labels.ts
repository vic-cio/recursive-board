/**
 * Labels on a card.
 *
 * A label is an entry in `tags`, which decision D7 already allows as an optional field. That is
 * why labels need no schema change and no tenth field: the freeze broke twice in one grill
 * already, and the bar for the next addition is high. It also means a label is a real Obsidian
 * tag, so search, the tag pane and the graph all see it without the plugin doing anything.
 *
 * The colour is derived from the label's text rather than configured. A settings pane mapping
 * labels to colours is a thing to maintain and a thing to sync; a hash is stable across devices,
 * needs no storage, and cannot disagree with itself between the Mac and the phone.
 */

/** The eight colours every Obsidian theme defines. */
export const LABEL_COLOURS = [
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink',
] as const

export type LabelColour = (typeof LABEL_COLOURS)[number]

/** Reads `tags`, which Obsidian accepts as a list or as one string. */
export function readLabels(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,\s]+/)
      : []

  const seen = new Set<string>()
  const labels: string[] = []
  for (const part of parts) {
    if (typeof part !== 'string') continue
    const label = part.trim().replace(/^#/, '')
    if (label === '' || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    labels.push(label)
  }
  return labels
}

/**
 * A stable colour for a label. Case and the leading `#` are ignored, so `#web`, `web` and
 * `Web` are one label in one colour.
 */
export function labelColour(label: string): LabelColour {
  const key = label.trim().replace(/^#/, '').toLowerCase()
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return LABEL_COLOURS[hash % LABEL_COLOURS.length]!
}

/** The last segment of a nested tag: `area/web` shows as `web`. */
export function labelText(label: string): string {
  const parts = label.split('/')
  return parts[parts.length - 1] ?? label
}
