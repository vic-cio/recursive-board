import { parseWebReviewMode, type WebReviewMode } from './dashboard-model.ts'

export interface DeviceDashboardState {
  you: string
  root: string
  focus: string | null
  webReviewMode: WebReviewMode
  /** The finished fold under the Agents feed. Per device, so opening it on one device leaves another closed. */
  finishedOpen: boolean
  /** The For review groups folded on this device, by group key (the area's path, '' for no area). */
  foldedGroups: string[]
}

export type DashboardTicks = Record<string, true>

const EMPTY_DEVICE_STATE: DeviceDashboardState = {
  you: '',
  root: '',
  focus: null,
  webReviewMode: 'webviewer',
  finishedOpen: false,
  foldedGroups: [],
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseDeviceDashboardState(value: unknown): DeviceDashboardState {
  const data = record(value)
  return {
    you: typeof data['you'] === 'string' ? data['you'] : EMPTY_DEVICE_STATE.you,
    root: typeof data['root'] === 'string' ? data['root'] : EMPTY_DEVICE_STATE.root,
    focus: typeof data['focus'] === 'string' ? data['focus'] : null,
    webReviewMode: parseWebReviewMode(data['webReviewMode']),
    finishedOpen: data['finishedOpen'] === true,
    foldedGroups: Array.isArray(data['foldedGroups'])
      ? [...new Set(data['foldedGroups'].filter((key): key is string => typeof key === 'string'))]
      : [],
  }
}

/** The folded group keys with one group folded or unfolded. */
export function withFold(folded: readonly string[], key: string, fold: boolean): string[] {
  const rest = folded.filter((other) => other !== key)
  return fold ? [...rest, key] : rest
}

export function parsePersonTicks(value: unknown): DashboardTicks {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return {} }
  }
  const data = record(record(parsed)['ticks'])
  const ticks: DashboardTicks = {}
  for (const [path, ticked] of Object.entries(data)) if (ticked === true) ticks[path] = true
  return ticks
}

export function mergeTicks(...sets: DashboardTicks[]): DashboardTicks {
  return Object.assign({}, ...sets)
}

/** Splits old plugin-data dashboard state into device choices and the person's ticks. */
export function splitLegacyDashboardState(legacy: unknown, device: unknown): {
  device: DeviceDashboardState
  personName: string
  ticks: DashboardTicks
} {
  const old = record(legacy)
  const saved = record(device)
  const pick = (key: Exclude<keyof DeviceDashboardState, 'finishedOpen' | 'foldedGroups'>): unknown => {
    const value = saved[key]
    if (key === 'you' || key === 'root') return typeof value === 'string' ? value : old[key]
    if (key === 'focus') return value === null || typeof value === 'string' ? value : old[key]
    return value === 'webviewer' || value === 'browser' || value === 'off' ? value : old[key]
  }
  const next = parseDeviceDashboardState({
    you: pick('you'), root: pick('root'), focus: pick('focus'), webReviewMode: pick('webReviewMode'),
    finishedOpen: saved['finishedOpen'], foldedGroups: saved['foldedGroups'],
  })
  const legacyOwner = typeof old['you'] === 'string' ? old['you'] : ''
  return {
    device: next,
    personName: legacyOwner.trim() === '' ? next.you : legacyOwner,
    ticks: parsePersonTicks({ ticks: old['ticks'] }),
  }
}

/** Encode a person name as one safe path segment, including dot-only and Unicode names. */
export function safePersonFileName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return encodeURIComponent(trimmed).replace(/\./g, '%2E')
}

/** One person's ticks in the plugin data, which Obsidian Sync carries: `people.<name>.ticks`. */
export function personTicks(data: unknown, name: string): DashboardTicks {
  return parsePersonTicks(record(record(record(data)['people'])[name.trim()]))
}

/** The plugin data with one person's ticks replaced. Every other key and person is kept. */
export function withPersonTicks(data: Record<string, unknown>, name: string, ticks: DashboardTicks): Record<string, unknown> {
  const people = { ...record(data['people']) }
  if (Object.keys(ticks).length > 0) people[name.trim()] = { ticks }
  else delete people[name.trim()]
  const next = { ...data }
  if (Object.keys(people).length > 0) next['people'] = people
  else delete next['people']
  return next
}

/** Applies what changed between two tick sets on this device to the stored set, keeping ticks made elsewhere. */
export function applyTickChanges(stored: DashboardTicks, before: DashboardTicks, after: DashboardTicks): DashboardTicks {
  const next = { ...stored }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] === after[key]) continue
    if (after[key]) next[key] = true
    else delete next[key]
  }
  return next
}
