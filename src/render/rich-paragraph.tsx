/**
 * The paragraph of a composed text (9.6.0, with the parts of an amount of 9.19.0): the pieces
 * of the string with the styles of their places and parts, and the STRUT of the paragraph.
 * The rule is `rich-text.ts`; this file is only the CSS of it.
 */
import { Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { colorCss, typographyCss } from '../resolve'
import { activeTextSpans, declaredSpanStyles, lineMetricOf, readTextSpans, richTextStrut, spanRunKey, spanRuns } from '../rich-text'
import type { DeclaredSpanStyle } from '../rich-text'
import { isRecord } from '../sanitize'
import type { Css, TextStyleContext } from '../style'
import { typographyToCss } from '../style'
import { emphasisCss, emphasisOfContext, isRootEmphasis, runEmphasisOf } from '../text-emphasis'
import type { TemplateRun } from '../text-template'
import type { Theme } from '../theme'

const asCss = (css: Css): CSSProperties => css

/** Properties of the font that the paragraph sets again — from the strut. */
const TYPOGRAPHY_KEYS = ['font', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const

export function withoutTypography(css: CSSProperties): CSSProperties {
  const rest: Record<string, unknown> = { ...css }
  for (const key of TYPOGRAPHY_KEYS) Reflect.deleteProperty(rest, key)
  return rest
}

/**
 * A font style by its LONG properties, without the shorthand `font`. The paragraph sets
 * `line-height: 0` on every piece, and the shorthand would reset it (and React complains
 * about a shorthand mixed with long properties).
 */
function typographyLonghands(ref: unknown, theme: Theme): CSSProperties {
  const token = typeof ref === 'string' ? ref : isRecord(ref) ? ref.token : undefined
  const spec = typographyCss(isRecord(ref) ? ref : { token }, theme)
  return asCss(typographyToCss(spec))
}

/**
 * COMPOSED TEXT: the pieces of a string with the styles of their places and of the parts of
 * an amount, and the strut of the paragraph.
 *
 *  - a piece is an inline `span` with its font and colour; the baseline is common, because
 *    this is ordinary inline content (`spanAlign: 'baseline'`);
 *  - the pitch of the lines is ONE: the paragraph carries the font of the STRUT (the tallest
 *    line among the base style, the places and the parts declared in the node), and every
 *    piece has `line-height: 0` — an inline box of zero height cannot spread a line, so its
 *    height is exactly the line of the strut wherever the big word wraps to;
 *  - when the strut is a place or a part, the base pieces are wrapped too: the font of the
 *    paragraph is no longer theirs. When the strut is the base style, the base text stays a
 *    bare text node;
 *  - a part of an amount is its own piece only when the place gave it a style; its style lies
 *    over the style of the place (a named field replaces, one not named stays as the place has
 *    it), and a font the theme does not know leaves the font of the place;
 *  - ONE paragraph element with inline `span`s without roles: a screen reader hears the whole
 *    line as one node.
 *
 * `undefined` — there is no composed text (not a template, no style in force): the node is drawn
 * as a plain `Text`.
 */
export function richParagraph(
  props: Readonly<Record<string, unknown>>,
  runs: readonly TemplateRun[] | undefined,
  text: TextStyleContext,
  theme: Theme,
  content: string,
): { readonly paragraph: CSSProperties | undefined; readonly runs: ReactNode } | undefined {
  const spans = activeTextSpans(props.content, readTextSpans(props.spans))
  const emphasis = emphasisOfContext(text)
  const base = lineMetricOf(text.typography, theme)

  /*
   * A text without parts: the emphasis of the node goes as ONE piece inside the value. The
   * paragraph does not carry the line (the line of a paragraph would go through the nested
   * elements in its colour), and a bare text without emphasis is exactly the markup of 9.16.
   */
  if (runs === undefined || Object.keys(spans).length === 0 || base === undefined) {
    if (isRootEmphasis(emphasis)) return undefined
    return { paragraph: undefined, runs: <span style={emphasisCss(emphasis)}>{content}</span> }
  }

  const declared = new Map<string, DeclaredSpanStyle>(declaredSpanStyles(spans).map((style) => [style.key, style]))
  const placeFont = (span: string): unknown => (lineMetricOf(spans[span]?.typography, theme) === undefined ? undefined : spans[span]?.typography)
  // The font of a declared style: its own if the theme knows it, else the font of its place (for a part), else none.
  const fontOf = (style: DeclaredSpanStyle): unknown => (lineMetricOf(style.style.typography, theme) === undefined ? (style.part === undefined ? undefined : placeFont(style.span)) : style.style.typography)
  const metrics = Object.fromEntries([...declared.values()].map((style) => [style.key, lineMetricOf(fontOf(style), theme) ?? base]))
  const strut = richTextStrut(base, metrics)
  const strutStyle = strut.span === undefined ? undefined : declared.get(strut.span)
  const strutFont = strutStyle === undefined ? undefined : fontOf(strutStyle)

  const baseRun: CSSProperties = { ...typographyLonghands(text.typography, theme), lineHeight: 0 }
  const cssOf = (style: DeclaredSpanStyle | undefined): CSSProperties | undefined => {
    if (style === undefined) return strutFont === undefined ? undefined : baseRun
    const color = colorCss(style.style.color, theme)
    const own = fontOf(style)
    return {
      ...(color === undefined ? {} : { color }),
      ...(own === undefined ? (strutFont === undefined ? {} : typographyLonghands(text.typography, theme)) : typographyLonghands(own, theme)),
      lineHeight: 0,
    }
  }

  return {
    // The paragraph carries the font of the STRUT always: when the strut is the base style, this is the font of the node.
    paragraph: typographyLonghands(strutFont ?? text.typography, theme),
    runs: spanRuns(runs, spans).map((run, index) => {
      const style = declared.get(spanRunKey(run) ?? '')
      // The emphasis of a piece: a part over a place over the text, each field on its own. The line and the slant are carried by the piece, not by the paragraph.
      const look = emphasisCss(runEmphasisOf(emphasis, style?.style))
      const css = cssOf(style)
      // The order of the pieces is fixed for one render, and a piece has no key of its own.
      const key = `${String(index)}:${run.span ?? ''}${run.part === undefined ? '' : `.${run.part}`}`
      if (css === undefined && Object.keys(look).length === 0) return <Fragment key={key}>{run.text}</Fragment>
      // The weight comes AFTER the long properties of the font: it is stronger than the font style of the piece and of the text.
      return (
        <span key={key} style={{ ...(css ?? { lineHeight: 0 }), ...look }}>
          {run.text}
        </span>
      )
    }),
  }
}
