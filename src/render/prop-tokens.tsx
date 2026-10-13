/** Tokens named in `props` (spacing, colour) resolved to CSS with the default of the field, and the inline margin of a node box. */
import type { CSSProperties } from 'react'

import { colorCss, mathLength, spacingCss, spacingMathCss } from '../resolve'
import type { Css } from '../style'
import { productVar } from '../theme'
import type { Theme } from '../theme'
import { useTheme } from './contexts'

export const asCss = (css: Css): CSSProperties => css

/**
 * A TOKEN IN A `props` FIELD, with the FIELD fallback.
 *
 * `props` keeps the colours and spacing of the PARTS of a widget (the gap between children, the
 * divider line, the bar fill). Every such field has a default in the schema, so an unknown token
 * there does not "vanish" but becomes the field default (`unknownToken: 'fallback-to-field-default'`).
 * The default is a value of the CONTRACT (`default` in `screen-schema.json`), not a reader choice;
 * all of them come from the theme core.
 *
 * `style` has no defaults by construction, and a different rule applies there: `omit-field` (see
 * `resolve.ts`).
 */
export function useSpacing(value: unknown, fieldDefault: string): string {
  const theme = useTheme()
  return spacingCss(value as string | number | undefined, theme) ?? productVar('spacing', fieldDefault)
}

/** The same gap, but FOR CSS MATH: the theme number with its unit (`none` is `0px`), not a variable that may be a bare `0`. */
export function useSpacingMath(value: unknown, fieldDefault: string): string {
  const theme = useTheme()
  return spacingMathCss(value as string | number | undefined, theme) ?? spacingMathCss(fieldDefault, theme) ?? '0px'
}

/** A spacing token named by the CONTRACT (not by the document), for CSS math: the theme number with its unit. */
export function mathToken(token: string, theme: Theme): string {
  return spacingMathCss(token, theme) ?? '0px'
}

export function usePropColor(value: unknown, fieldDefault: string): string {
  const theme = useTheme()
  return colorCss(value, theme) ?? productVar('color', fieldDefault)
}

/** The node margin on one side of the inline axis, for `calc()`; zero without a margin. */
export function inlineMarginOf(box: Css, side: 'InlineStart' | 'InlineEnd', theme: Theme): string {
  const value = box[`margin${side}`] ?? box.margin
  return typeof value === 'string' || typeof value === 'number' ? mathLength(value, theme) : '0px'
}
