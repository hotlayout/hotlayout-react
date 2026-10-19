/**
 * Blur under a modal layer and glass under a box (schema 9.20.0).
 *
 * One number with one meaning in two places: the `backdropBlur` of a modal screen entry blurs
 * everything under the layer, `style.backdropBlur` blurs what lies under the box of a node, within
 * its radius. The number is the standard deviation of a Gaussian blur in logical pixels, which is
 * exactly what CSS `blur(Npx)` takes. The rules are contract data (`x-backdropBlur`); the bounds are
 * mirrored here and kept together with the artifact by the case table
 * `contract/fixtures/motion/motion-cases.json`.
 *
 * The number reaches a style ONLY through {@link backdropBlurOf} (a whole number within the bounds)
 * and `cssNumber`: a string, a fraction, zero, an out-of-range number or a smuggled declaration is
 * "no field".
 */
import { cssNumber, exactInteger } from './sanitize'

/** Mirror of `x-backdropBlur.radius`. No zero: "no blur" is the absence of the field. */
export const BACKDROP_BLUR_RANGE = { min: 1, max: 40 } as const

/** The effective radius: a whole number within the bounds, or nothing. */
export function backdropBlurOf(value: unknown): number | undefined {
  return exactInteger(value, BACKDROP_BLUR_RANGE.min, BACKDROP_BLUR_RANGE.max)
}

/** The CSS filter for a validated radius. */
export function blurFilterCss(radius: number): string {
  return `blur(${cssNumber(radius)}px)`
}

/** Both spellings of the property: older Safari knows only the prefixed one. */
export function backdropFilterCss(radius: number): Readonly<Record<'backdropFilter' | 'WebkitBackdropFilter', string>> {
  const filter = blurFilterCss(radius)
  return { backdropFilter: filter, WebkitBackdropFilter: filter }
}
