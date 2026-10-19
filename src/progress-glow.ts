/**
 * The glow of a scale (schema 9.25.0, field `glow` of `ProgressBar` and `CircularProgress`). A
 * mirror of the contract's reference rule; the shared table
 * `contract/fixtures/progress/progress-cases.json` (groups `glow...`) keeps the two copies together.
 *
 * The glow is a blurred copy of the FILL paint under the scale: its colour or its gradient along
 * the fill, with the ends, no offset and no spread. The track does not glow. A bar with steps lights
 * ONE step: the current one when `currentColor` paints it (the whole step, in that colour),
 * otherwise the last step with any fill (its drawn part). It changes no layout and is not clipped
 * by the box of the scale, only by ancestors that clip, as a shadow.
 */

export const PROGRESS_GLOWS = ['soft', 'strong'] as const
export type ProgressGlow = (typeof PROGRESS_GLOWS)[number]

/** The numbers of a word: the standard deviation of the blur (logical pixels) and the multiplier of the opacity. */
export const PROGRESS_GLOW_STRENGTH = {
  soft: { sigma: 4, opacity: 0.55 },
  strong: { sigma: 8, opacity: 0.9 },
} as const satisfies Record<ProgressGlow, { readonly sigma: number; readonly opacity: number }>

/** The word as the reader takes it: an unknown one (or a field of another type) is no glow. */
export function readProgressGlow(value: unknown): ProgressGlow | undefined {
  return PROGRESS_GLOWS.find((glow) => glow === value)
}

export type GlowingStep =
  | { readonly kind: 'none' }
  /** The current step, painted by `currentColor`: the whole step glows in that colour. */
  | { readonly kind: 'current'; readonly index: number }
  /** The front step: its drawn fill (the share `fill`) glows. */
  | { readonly kind: 'front'; readonly index: number; readonly fill: number }

/** Which step of a bar glows. `fills` are the fills of the steps (0..1), `currentPainted` is whether `currentColor` is there and resolves. */
export function glowingStepOf(fills: readonly number[], currentPainted: boolean): GlowingStep {
  const current = fills.findIndex((fill) => fill < 1)
  if (currentPainted && current !== -1) return { kind: 'current', index: current }
  let front = -1
  fills.forEach((fill, index) => {
    if (fill > 0) front = index
  })
  const fill = fills[front]
  return front === -1 || fill === undefined ? { kind: 'none' } : { kind: 'front', index: front, fill }
}

/** `x-progressGlow` of the artifact, whole; a test compares the two. */
export const PROGRESS_GLOW_RULES = {
  prop: 'glow',
  on: ['ProgressBar', 'CircularProgress'],
  value: 'one word of «strength»; no field or an unknown word — no glow',
  strength: PROGRESS_GLOW_STRENGTH,
  sigma: 'standard deviation of a Gaussian blur, logical pixels (CSS blur(sigma px), Flutter MaskFilter.blur(normal, sigma))',
  opacity: 'multiplies the alpha of the paint of the copy',
  paint: 'a copy of the fill paint — its colour, or its gradient along the fill — under the shape; no offset, no spread',
  bar: 'the fill, with its ends (cap); the track does not glow',
  ring: 'the arc of the fill, with its ends (cap); the track does not glow',
  segments: {
    glows: 'one step',
    current: 'the current step (the first one not full) when currentColor paints it: the whole step glows in that colour',
    front: 'otherwise the last step with any fill: the drawn part of its fill glows in the fill paint',
    others: 'no glow',
    nothing: 'no step filled and no painted current step — no glow',
  },
  empty: 'nothing is filled — no glow',
  layout: 'none: the glow takes no room and moves nothing',
  clip: 'not clipped by the track, the step or the box of the node; clipped only by ancestors that clip, as a shadow',
  transition: 'follows the shown fill frame by frame (x-valueTransition, x-valueAppear, x-segmentsTransition)',
  reducedMotion: 'not motion: drawn as named',
  semantics: 'none',
  editorCanvas: 'drawn: it is the look of the scale',
  olderReader: 'skips the field — no glow',
  cases: 'contract/fixtures/progress/progress-cases.json',
} as const
