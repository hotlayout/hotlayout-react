/**
 * The dot on a navigation item (schema 9.22.0, `NavItem.badgeWhen`). A mirror of the contract's
 * reference rule; the shared rows are the `navBadgeCases` and `navBadgeBoxCases` groups of
 * `contract/fixtures/bottom-zone/bottom-zone-cases.json`, and the block below is compared with the
 * artifact key `x-style.layout.navBadge`.
 *
 * The condition has the form of `visibleIf` and the same missing-data rule; the difference is what
 * a form the reader does not understand does: here there is NO DOT (a dot nobody asked for is the
 * worse mistake), where `visibleIf` would show the node. The dot is a circle of 8 in the core token
 * `accent`, centred on the top corner of the icon at the end of the line; it does not change the size
 * of the item, is not clipped by it and is not announced (the name of the item stays its label).
 *
 * No React in this file: the server graph of the entry reads it too.
 */
import { isUnderstoodConditionMet } from './conditions'
import type { DataScope } from './data'
import { isRecord } from './sanitize'

export const NAV_BADGE_KEY = 'badgeWhen'

/** The diameter of the dot, in points. */
export const NAV_BADGE_DIAMETER = 8

/** `x-style.layout.navBadge` of the artifact, whole; a test compares the two. */
export const NAV_BADGE_RULES = {
  prop: NAV_BADGE_KEY,
  on: 'NavItem',
  refines: ['navBar.badge'],
  condition: 'same-form-check-and-missing-data-rule-as-visibleIf',
  shown: 'condition-holds',
  unknownCondition: 'no-dot',
  mark: 'dot',
  count: 'none-in-9.22',
  color: 'accent',
  diameter: NAV_BADGE_DIAMETER,
  place: 'centre-on-the-top-inline-end-corner-of-the-glyph',
  rightToLeft: 'top-left-corner-of-the-glyph',
  clip: 'not-clipped-by-the-item',
  size: 'does-not-change-the-item',
  activeItem: 'drawn-as-well',
  hiddenItem: 'no-dot',
  wide: 'the-same-in-every-place-of-the-bar',
  accessibleName: 'unchanged-the-dot-is-not-announced',
  press: 'part-of-the-item',
  olderReader: 'no-dot',
  cases: 'contract/fixtures/bottom-zone/bottom-zone-cases.json',
} as const

/** Whether the dot is shown: the condition holds on this data. No field, or a form the reader does not understand, is no dot. */
export function navBadgeShown(props: unknown, scope: DataScope): boolean {
  return isRecord(props) && props[NAV_BADGE_KEY] !== undefined && isUnderstoodConditionMet(props[NAV_BADGE_KEY], scope)
}

export interface GlyphBox {
  /** From the LEFT edge of the item to the left edge of the glyph. */
  readonly left: number
  readonly top: number
  /** The side of the square of the glyph. */
  readonly size: number
}

/** The box of the dot in the coordinates of the item: the centre is on the top corner of the glyph at the END of the line. */
export function navBadgeBox(glyph: GlyphBox, rtl = false): { readonly left: number; readonly top: number; readonly size: number } {
  const corner = rtl ? glyph.left : glyph.left + glyph.size
  return { left: corner - NAV_BADGE_DIAMETER / 2, top: glyph.top - NAV_BADGE_DIAMETER / 2, size: NAV_BADGE_DIAMETER }
}
