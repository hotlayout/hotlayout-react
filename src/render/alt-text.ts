/**
 * The description of a picture or an icon for a screen reader (schema 9.19.0): a plain string OR a string of the
 * document — a binding to data, a template or a wrapped literal — read and translated like any other text.
 *
 * A plain string is translated under the key of the field itself (`<screen>/<node>/alt`); without a translation it is
 * the string. The rule of shown text applies (runs of spaces collapse, the edges are cut). An empty result — the
 * picture is decorative: no role, no name, hidden from the reader. A string from data that is empty is "no value":
 * the fallback text.
 */
import { isRecord } from '../sanitize'
import { shownTextOf } from '../shown-text'
import { useText } from './use-text'

/** The field as a string of the document: a plain string is a literal. */
function altOf(value: unknown): unknown {
  return typeof value === 'string' ? { kind: 'literal', value } : isRecord(value) ? value : undefined
}

/** The description to read; `undefined` — there is none, the picture is decorative. */
export function useAltText(value: unknown): string | undefined {
  const shown = shownTextOf(useText(altOf(value), 'alt'))
  return shown === '' ? undefined : shown
}
