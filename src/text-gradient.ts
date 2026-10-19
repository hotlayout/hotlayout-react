/**
 * A gradient on the glyphs of a text (schema 9.23.0, `style.textGradient`). A mirror of the
 * contract's rule; the numbers of the block are checked against the artifact block
 * `x-textGradient`, and the shared rows are the `textGradient…` groups of
 * `contract/fixtures/rich-text/rich-text-cases.json`.
 *
 *  - the value is a gradient token of the theme or an own gradient of the same form as a gradient
 *    `background`; it is resolved by the SAME code (`gradientCss`), so it passes the same
 *    `sanitize` layer as the background: the colours and the angle are checked by their form;
 *  - only `Text` reads it and it is NOT inherited: the field is read off the node's own resolved
 *    style (the state laid over the base, as every style field);
 *  - the gradient lies over the whole content box of the text, ONE transition for all the lines:
 *    the paragraph's content is wrapped in one block that carries the gradient clipped to the
 *    glyphs, inside the padding of the node;
 *  - the fallback colour (`color`, own or inherited) stays: the line of the emphasis and the
 *    marker of a list item are drawn in it, and so is the whole text when the gradient does not
 *    resolve (an unknown token, stops that run backwards).
 *
 * No React in this file: the server graph of the entry reads it too.
 */
import type { CSSProperties } from 'react'

import { gradientCss } from './resolve'
import type { Theme } from './theme'
import type { GradientRef } from './types'

/** Mirror of `x-textGradient`, whole. */
export const TEXT_GRADIENT_RULES = {
  prop: 'style.textGradient',
  value: 'a-gradient-token-or-an-own-gradient-as-the-gradient-of-background',
  readers: ['Text'],
  inherited: false,
  paints: 'the-glyphs-of-the-text',
  box: 'the-content-box-of-the-text-inside-padding-one-gradient-for-all-lines',
  angle: 'as-the-gradient-of-background-x-gradientGeometry',
  partWithOwnColor: 'keeps-its-colour',
  partWithoutColor: 'painted-by-the-gradient',
  fallback: {
    color: 'style.color-or-the-inherited-colour',
    when: ['older-reader', 'unknown-token', 'stops-out-of-order'],
  },
  decoration: 'the-fallback-colour',
  listMarker: 'the-fallback-colour',
  states: 'styleWhen-and-styleOn-may-name-it-merged-as-every-style-field',
  otherWidgets: 'not-published-text_gradient_not_read',
  cases: 'contract/fixtures/rich-text/rich-text-cases.json#textGradientCases',
} as const

/** Widgets that read the field. */
const READERS: readonly string[] = TEXT_GRADIENT_RULES.readers

/**
 * The paint of the glyphs, or `undefined` when the text keeps its colour: the node is not a reader,
 * there is no field, or the gradient does not resolve. The result is the style of the BLOCK that
 * wraps the content of the paragraph.
 */
export function textGradientPaint(nodeType: string, ref: unknown, theme: Theme): CSSProperties | undefined {
  if (ref === undefined || ref === null || !READERS.includes(nodeType)) return undefined
  const image = gradientCss(ref as GradientRef, theme)
  if (image === undefined) return undefined
  return { display: 'block', backgroundImage: image, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }
}

/** The fill of a piece that named its own colour: that colour, over the gradient of the paragraph. */
export const OWN_COLOUR_FILL: CSSProperties = { WebkitTextFillColor: 'currentcolor' }

/** Whether a part of a composed text is painted by the gradient: yes, until it names a colour of its own. */
export function partTakesTextGradient(gradient: unknown, part: { readonly color?: unknown } | undefined): boolean {
  return gradient !== undefined && gradient !== null && part?.color === undefined
}
