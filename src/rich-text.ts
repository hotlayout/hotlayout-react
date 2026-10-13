/**
 * COMPOSED TEXT (schema 9.6.0): parts of one string with their own style. A mirror of the
 * contract's reference implementation (the package does not import the builder's sources). The
 * two copies are held together by the shared case table
 * `contract/fixtures/rich-text/rich-text-cases.json`, and `package.test.tsx` checks the words of
 * the `x-style.layout.richText` block against the artifact.
 *
 * The rule, in short:
 *
 *  1. TEXT is exactly what it is without `spans` (`templateText`). Styles change no character;
 *  2. RUNS are `templateRuns` (there is one template parser) -> `spanRuns`: empty ones dropped,
 *     neighbors with the same style merged. A style attaches to the PLACE NAME, not to the run
 *     number;
 *  3. A PART'S STYLE is laid over the text style by the inheritance rule: a named `color` and
 *     `typography` replace the base ones WHOLE, unnamed ones stay base; a token the theme does
 *     not know leaves the field base;
 *  4. THE LINE: parts sit on a shared baseline; the LINE STEP IS ONE for the whole paragraph and
 *     equals the tallest line (font size x multiplier) among the base style and the parts
 *     declared in the node (`richTextStrut`). The style that gave the step is the STRUT;
 *  5. THE PARAGRAPH is one text, wraps by words across parts, a style does not isolate a part in
 *     bidi, and a screen reader hears one node.
 *
 * TRUST BOUNDARY. `spans` comes from the network: the map is read by OWN keys (`constructor`
 * does not become a part), every style field is read by shape separately, and the only thing
 * that reaches CSS is what `resolve.ts` composed (a theme variable, hex, `rgba()` from numbers).
 * The module does not import `react`.
 */
import { LITERAL_BOUNDS } from './resolve'
import { isRecord, safeIdent } from './sanitize'
import type { Theme } from './theme'
import { declares } from './theme'
import { FORMAT_PARTS } from './money'
import type { FormatPart } from './money'
import type { TemplateRun } from './text-template'
import { readDecoration, readFontStyle, readSpanWeight } from './text-emphasis'
import type { TextDecoration, TextFontStyle, TextSpanWeight } from './text-emphasis'

/** What a part may have of its own, `x-style.layout.richText.styleKeys`: exactly the two fields the text inherits. */
export const TEXT_SPAN_STYLE_KEYS = ['color', 'typography'] as const

/**
 * LINE AND PARAGRAPH RULES AS DATA: a mirror of the artifact's `x-style.layout.richText` (a test
 * compares them). The reader executes them in the code below and in `TextView`; the constant
 * exists so that a divergence from the artifact fails a test instead of being noticed by eye.
 */
export const RICH_TEXT_LAYOUT = {
  spanAlign: 'baseline',
  linePitch: 'uniform',
  lineHeight: 'tallest-declared-part',
  strutTieBreak: ['larger-font-size', 'base-style', 'span-name-ascending'],
  wrap: 'paragraph',
  bidi: 'no-isolation',
  textWidth: 'sum-of-runs',
  styleKeys: ['color', 'typography'],
  places: { Text: { spans: 'spans', text: 'content' } },
} as const

/** Names of template places, `x-template.valueNamePattern`. */
const PLACE_NAME = /^[a-z][A-Za-z0-9]{0,23}$/

/** The style of a part AFTER shape-reading: references to a color and a font, as they stand in the document. */
export interface AmountPartStyle {
  readonly color?: unknown
  readonly typography?: unknown
  /** 9.17.0: the part's weight word (`regular` ... `bold`); the number comes from `TEXT_EMPHASIS.weights`. */
  readonly weight?: TextSpanWeight
  readonly fontStyle?: TextFontStyle
  readonly textDecoration?: TextDecoration
}

/** Styles of the parts of a place's sum (9.19.0, `Text.spans[place].parts`). */
export type TextSpanParts = Readonly<Partial<Record<FormatPart, AmountPartStyle>>>

export interface TextSpanStyle extends AmountPartStyle {
  readonly parts?: TextSpanParts
}

export type TextSpans = Readonly<Record<string, TextSpanStyle>>

const HEX6 = /^#[0-9a-f]{6}$/

function isOpacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/** `ColorRef` by SHAPE: a token, a token with opacity, or an own value `#rrggbb` (with or without opacity). */
export function colorRefByForm(value: unknown): boolean {
  if (safeIdent(value) !== undefined) return true
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (typeof value.token === 'string') return safeIdent(value.token) !== undefined && isOpacity(value.opacity) && keys.length === 2
  if (typeof value.value === 'string') return HEX6.test(value.value) && (value.opacity === undefined || isOpacity(value.opacity)) && keys.every((key) => key === 'value' || key === 'opacity')
  return false
}

const TYPOGRAPHY_OVERRIDES = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const

function inRange(value: unknown, kind: keyof typeof LITERAL_BOUNDS): value is number {
  const [min, max] = LITERAL_BOUNDS[kind]
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/** `TypographyRef` by SHAPE: a token, or a token with tweaks (at least one, each within the field's bounds). */
export function typographyRefByForm(value: unknown): boolean {
  if (safeIdent(value) !== undefined) return true
  if (!isRecord(value) || safeIdent(value.token) === undefined) return false
  const keys = Object.keys(value).filter((key) => key !== 'token')
  if (keys.length === 0 || keys.some((key) => !(TYPOGRAPHY_OVERRIDES as readonly string[]).includes(key))) return false
  return keys.every((key) => {
    const entry = value[key]
    if (key === 'fontWeight') return inRange(entry, 'fontWeight') && Number.isInteger(entry) && (entry) % 100 === 0
    return inRange(entry, key as keyof typeof LITERAL_BOUNDS)
  })
}

/**
 * Part styles as the READER reads them, tolerantly, field by field:
 *  - `spans` that is not an object (a string, an array) means no parts (`unreadableSpans`);
 *  - a key that does not match the place-name pattern is not a part;
 *  - a style that is not an object, is empty, or has no field the reader could read leaves the
 *    place drawn in the base style (`unreadableSpanStyle`);
 *  - a field the reader does not know, or a known one of the wrong shape, is skipped and the rest
 *    of the style applies (`unknownSpanField`).
 *
 * `Object.keys` takes only OWN keys: `constructor` will not become a style.
 */
export function readTextSpans(value: unknown): TextSpans {
  if (!isRecord(value) || Array.isArray(value)) return {}

  const spans: Record<string, TextSpanStyle> = {}
  for (const name of Object.keys(value)) {
    if (!PLACE_NAME.test(name) || name === '__proto__') continue
    const entry = value[name]
    if (!isRecord(entry)) continue
    const style = readStyleFields(entry)
    const parts = readSpanParts(entry.parts)
    if (style === undefined && parts === undefined) continue
    spans[name] = { ...style, ...(parts === undefined ? {} : { parts }) }
  }
  return spans
}

/** The five style fields from one entry; `undefined` means no readable field. An unknown word means no field (`unknownWord`). */
function readStyleFields(entry: Readonly<Record<string, unknown>>): AmountPartStyle | undefined {
  const color = colorRefByForm(entry.color)
  const typography = typographyRefByForm(entry.typography)
  const weight = readSpanWeight(entry.weight)
  const fontStyle = readFontStyle(entry.fontStyle)
  const textDecoration = readDecoration(entry.textDecoration)
  if (!color && !typography && weight === undefined && fontStyle === undefined && textDecoration === undefined) return undefined
  return {
    ...(color ? { color: entry.color } : {}),
    ...(typography ? { typography: entry.typography } : {}),
    ...(weight === undefined ? {} : { weight }),
    ...(fontStyle === undefined ? {} : { fontStyle }),
    ...(textDecoration === undefined ? {} : { textDecoration }),
  }
}

/** Styles of the parts of a sum (9.19.0): `parts` that is not an object means no parts; an unknown part and a style with no readable field are skipped. */
function readSpanParts(value: unknown): TextSpanParts | undefined {
  if (!isRecord(value) || Array.isArray(value)) return undefined
  const parts: Partial<Record<FormatPart, AmountPartStyle>> = {}
  for (const part of FORMAT_PARTS) {
    const entry = Object.hasOwn(value, part) ? value[part] : undefined
    const style = isRecord(entry) ? readStyleFields(entry) : undefined
    if (style !== undefined) parts[part] = style
  }
  return Object.keys(parts).length === 0 ? undefined : parts
}

/**
 * Styles that APPLY: only for places that `content` DECLARES (`spanWithoutPlace`); the name must
 * be an OWN key of the template's `values`. If `content` is a literal or a single binding, no
 * part applies.
 */
export function activeTextSpans(content: unknown, spans: TextSpans): TextSpans {
  if (!isRecord(content) || content.kind !== 'template' || !isRecord(content.values)) return {}
  const values = content.values
  return Object.fromEntries(Object.entries(spans).filter(([name]) => Object.hasOwn(values, name)))
}

/** A run of composed text: what is written and in whose style. `span: undefined` means the base style. */
export interface TextSpanRun {
  readonly text: string
  readonly span: string | undefined
  /** A part of a sum with its OWN style (9.19.0). Without the field, the run takes the place's style. */
  readonly part?: FormatPart | undefined
}

/**
 * Runs of a line with styles: empty ones dropped, neighbors with the same style merged. `spans`
 * are the EFFECTIVE styles already. A style attaches to the PLACE NAME, not the run number. A
 * part of a sum is a separate run only when the place gave THIS part a readable style (9.19.0);
 * otherwise it merges with the neighbors of its place.
 */
export function spanRuns(runs: readonly TemplateRun[], spans: TextSpans): readonly TextSpanRun[] {
  const result: TextSpanRun[] = []
  for (const run of runs) {
    if (run.text === '') continue
    const span = run.place !== undefined && Object.hasOwn(spans, run.place) ? run.place : undefined
    const part = span !== undefined && run.part !== undefined && spans[span]?.parts?.[run.part] !== undefined ? run.part : undefined
    const last = result[result.length - 1]
    if (last !== undefined && last.span === span && last.part === part) result[result.length - 1] = { text: last.text + run.text, span, ...(part === undefined ? {} : { part }) }
    else result.push({ text: run.text, span, ...(part === undefined ? {} : { part }) })
  }
  return result
}

/** Key of a sum part's style among the declared styles: `place.part` (a place name never contains a dot). */
export function spanPartKey(span: string, part: FormatPart): string {
  return `${span}.${part}`
}

/** Key of a run's style among the declared ones; `undefined` means the text's base style. */
export function spanRunKey(run: TextSpanRun): string | undefined {
  if (run.span === undefined) return undefined
  return run.part === undefined ? run.span : spanPartKey(run.span, run.part)
}

/** A declared style: of a place or of a part of its sum, ALREADY laid over the place's style (named fields replace, unnamed stay). */
export interface DeclaredSpanStyle {
  readonly key: string
  readonly span: string
  readonly part: FormatPart | undefined
  readonly style: AmountPartStyle
}

/**
 * All styles declared in a node: every place and every part of its sum. This list is what goes
 * into the strut (`richTextStrut`) and what the drawer of a run asks.
 */
export function declaredSpanStyles(spans: TextSpans): readonly DeclaredSpanStyle[] {
  return Object.entries(spans).flatMap(([span, { parts, ...own }]): DeclaredSpanStyle[] => [
    { key: span, span, part: undefined, style: own },
    ...FORMAT_PARTS.flatMap((part): DeclaredSpanStyle[] => {
      const style = parts?.[part]
      return style === undefined ? [] : [{ key: spanPartKey(span, part), span, part, style: { ...own, ...style } }]
    }),
  ])
}

/* ───────────────────────────── paragraph line ───────────────────────────── */

/** Font size in logical pixels and the line-height multiplier: theme units. */
export interface LineMetric {
  readonly fontSize: number
  readonly lineHeight: number
}

export interface RichTextStrut {
  /** Whose style is the strut: a part name, or `undefined` for the text's base style. */
  readonly span: string | undefined
  readonly fontSize: number
  readonly lineHeight: number
  /** Line step in logical pixels BEFORE the system font scale: font size x multiplier. */
  readonly lineBlock: number
}

const lineBlockOf = (metric: LineMetric): number => metric.fontSize * metric.lineHeight

/**
 * The paragraph STRUT: the tallest line among the base style and the parts. Whether the place is
 * used in this language's string does not matter: line height must not jump between
 * translations or between "has data" and "no data". Among equals: the larger font size; then the
 * base style; then the part name by ascending code units (JSON key order is not a rule).
 */
export function richTextStrut(base: LineMetric, spans: Readonly<Record<string, LineMetric>>): RichTextStrut {
  let best: { span: string | undefined; metric: LineMetric } = { span: undefined, metric: base }
  for (const name of Object.keys(spans).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
    const metric = spans[name]
    if (metric === undefined) continue
    const block = lineBlockOf(metric)
    const bestBlock = lineBlockOf(best.metric)
    if (block > bestBlock || (block === bestBlock && metric.fontSize > best.metric.fontSize)) best = { span: name, metric }
  }
  return { span: best.span, fontSize: best.metric.fontSize, lineHeight: best.metric.lineHeight, lineBlock: lineBlockOf(best.metric) }
}

/**
 * Line measure of a theme font style: the token's font size and multiplier with tweaks applied
 * (`fontSize`, `lineHeight`). If the theme does not know the token, `undefined`, and the style
 * stays base (`unknownInheritedToken`).
 */
export function lineMetricOf(ref: unknown, theme: Theme): LineMetric | undefined {
  const token = safeIdent(typeof ref === 'string' ? ref : isRecord(ref) ? ref.token : undefined)
  if (token === undefined || !declares(theme, 'typography', token) || !Object.hasOwn(theme.typography, token)) return undefined
  const base = theme.typography[token]
  if (base === undefined) return undefined
  const own = isRecord(ref) ? ref : {}
  const [minSize, maxSize] = LITERAL_BOUNDS.fontSize
  const [minLine, maxLine] = LITERAL_BOUNDS.lineHeight
  const size = typeof own.fontSize === 'number' && Number.isFinite(own.fontSize) ? Math.min(maxSize, Math.max(minSize, own.fontSize)) : base.fontSize
  const line = typeof own.lineHeight === 'number' && Number.isFinite(own.lineHeight) ? Math.min(maxLine, Math.max(minLine, own.lineHeight)) : base.lineHeight
  return { fontSize: size, lineHeight: line }
}
