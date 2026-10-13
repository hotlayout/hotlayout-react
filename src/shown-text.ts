/**
 * SHOWN TEXT (`x-style.layout.shownText`, 9.18.0 clarification): a mirror of the reference
 * `shownTextOf`.
 *
 * Consecutive space, tab, LF and CR become one space, there are no spaces at the ends, and
 * U+00A0 and the other characters stay. On the web CSS does this (`white-space: normal`) on the
 * TEXT NODE; by hand the string is collapsed where CSS cannot reach: in attributes
 * (`placeholder`, `aria-label`) and where code decides from the text ("empty", "has a mark").
 * It applies to every text an input field shows (label, hint, note, error), but not to the
 * field's VALUE, the ring and bar labels, or anything that goes to the host.
 */

import { isSilentText } from './layout-rules'
const COLLAPSIBLE = /[ \t\n\r]+/g

export function shownTextOf(text: string): string {
  return text.replace(COLLAPSIBLE, ' ').replace(/^ | $/g, '')
}

/** Mirror of the artifact block `x-style.layout.shownText` (equality is checked by `package.test.tsx`). */
export const SHOWN_TEXT_RULES = {
  collapsible: ['U+0020', 'U+0009', 'U+000A', 'U+000D'],
  runs: 'collapse-to-one-space',
  edges: 'trim',
  preserved: ['U+00A0'],
  of: 'the-ready-string-after-template-and-translation',
  appliesTo: ['Text', 'Button.label', 'Badge.label', 'ListTile', 'AppBar.title', 'NavItem.label', 'field-labels', 'field-placeholders', 'field-helpers', 'field-errors', 'accessible-names'],
  exempt: ['progress-label', 'input-value', 'host-payload'],
  silent: 'isSilentText-is-wider-the-shown-text-of-a-silent-string-stays-silent',
  canvas: 'css-white-space-normal-no-pre-on-human-text',
  cases: 'contract/fixtures/template/template-cases.json',
} as const

/**
 * Error state: the error text comes from HOST data. If there is something to hear, the field is
 * in the error state and the SHOWN text (`shownTextOf`, 9.18.0 clarification) stands in place of
 * the hint; empty, whitespace or invisible characters mean no error (the same "empty" as for an
 * accessible name).
 */
export function inputErrorOf(errorText: string | undefined): string | undefined {
  return errorText === undefined || isSilentText(errorText) ? undefined : shownTextOf(errorText)
}
