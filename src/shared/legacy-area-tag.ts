/** Detect old area tags so the board hides them and the free tag writer leaves them alone. */
export const LEGACY_AREA_TAG_PREFIX = 'area/'

export function isLegacyAreaTag(tag: string): boolean {
  return tag.replace(/^#/, '').toLowerCase().startsWith(LEGACY_AREA_TAG_PREFIX)
}
