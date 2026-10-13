/**
 * The style of ONE part of a composite widget (schema 9.19.0) — the colour and the typography of, say,
 * the trailing sum of a list row — and its states. A part has no box; its style does not go down the
 * tree. Rules: the artifact block `x-style.layout.partStyle`, mirrored below whole.
 *
 * The readers here judge only the SHAPE of a value (a token name, a tinted token, an own `#rrggbb`):
 * whether the theme knows the token is decided later, when the value becomes CSS — a token it does not
 * know makes the key skipped, and the part keeps what it would have without it.
 */
import { isRecord, safeIdent } from './sanitize'
import type { ColorRef, RadiusRef, TypographyRef } from './types'

const HEX_COLOR = /^#[0-9a-f]{6}$/
const TYPOGRAPHY_OVERRIDES = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const
const RADIUS_MAX = 256

const unit = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1

/** A colour of a form the schema names; anything else is "no colour". */
export function readColorRef(value: unknown): ColorRef | undefined {
  if (typeof value === 'string') return safeIdent(value) === undefined ? undefined : value
  if (!isRecord(value)) return undefined
  const keys = Object.keys(value)
  if (typeof value.token === 'string') return keys.length === 2 && safeIdent(value.token) !== undefined && unit(value.opacity) ? { token: value.token, opacity: value.opacity } : undefined
  if (typeof value.value === 'string' && HEX_COLOR.test(value.value) && keys.every((key) => key === 'value' || key === 'opacity')) {
    if (value.opacity === undefined) return { value: value.value }
    return unit(value.opacity) ? { value: value.value, opacity: value.opacity } : undefined
  }
  return undefined
}

/** A typography of a form the schema names: a token, or a token with at least one adjustment (and no other key). */
export function readTypographyRef(value: unknown): TypographyRef | undefined {
  if (typeof value === 'string') return safeIdent(value) === undefined ? undefined : value
  if (!isRecord(value) || typeof value.token !== 'string' || safeIdent(value.token) === undefined) return undefined
  const keys = Object.keys(value).filter((key) => key !== 'token')
  const named = keys.filter((key) => (TYPOGRAPHY_OVERRIDES as readonly string[]).includes(key))
  if (keys.length === 0 || named.length !== keys.length || !named.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) return undefined
  return value as TypographyRef
}

/** A radius of a form the schema names: a token or a whole number of pixels in 0…256. */
export function readRadiusRef(value: unknown): RadiusRef | undefined {
  if (typeof value === 'string') return safeIdent(value) === undefined ? undefined : value
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= RADIUS_MAX ? value : undefined
}

/** The style of a part: the two fields it can name. */
export interface PartStyle {
  readonly color?: ColorRef
  readonly typography?: TypographyRef
}

/** A style the reader understands: only the keys of the right shape count. `undefined` — no style. */
export function readPartStyle(value: unknown): PartStyle | undefined {
  if (!isRecord(value)) return undefined
  const color = readColorRef(value.color)
  const typography = readTypographyRef(value.typography)
  if (color === undefined && typography === undefined) return undefined
  return { ...(color === undefined ? {} : { color }), ...(typography === undefined ? {} : { typography }) }
}

/**
 * The effective style of a part: the base, and over it the FIRST state whose condition holds, per key —
 * the rule of `styleWhen` of a node. A state of the wrong form (no condition, nothing readable in its
 * style) is skipped and the next one is taken.
 */
export function resolvePartStyle(base: unknown, cases: unknown, isMet: (condition: never) => boolean): PartStyle | undefined {
  const own = readPartStyle(base)
  const active = Array.isArray(cases)
    ? (cases as readonly unknown[]).flatMap((entry) => {
        if (!isRecord(entry) || !isRecord(entry.when)) return []
        const style = readPartStyle(entry.style)
        return style === undefined ? [] : [{ when: entry.when, style }]
      }).find((entry) => isMet(entry.when as never))
    : undefined
  if (active === undefined) return own
  return own === undefined ? active.style : { ...own, ...active.style }
}

/** The block `x-style.layout.partStyle` of the artifact, whole (a test compares it). */
export const PART_STYLE_RULES = {
  keys: ['color', 'typography'],
  value: 'token-or-own-value-like-a-field-of-style',
  absentKey: 'not-applied-the-part-keeps-what-it-had',
  unknownToken: 'the-key-is-skipped',
  states: {
    condition: 'same-form-and-rules-as-visibleIf',
    scope: 'same-data-scope-as-styleWhen-of-the-node',
    pick: 'first-case-whose-condition-holds',
    merge: 'laid-over-the-base-style-of-the-part-per-key',
    max: 4,
    noCaseHolds: 'the-base-style-of-the-part',
    unreadableCase: 'skipped',
  },
  order: ['built-in-or-named-colour-of-the-node', 'style-of-the-part', 'state-of-the-part'],
  inherited: 'never-a-part-style-does-not-go-down-the-tree',
} as const
