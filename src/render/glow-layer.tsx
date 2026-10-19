/** The copy of the fill that makes the glow of a scale. */
import type { CSSProperties, ReactNode } from 'react'

import { PROGRESS_GLOW_STRENGTH } from '../progress-glow'
import type { ProgressGlow } from '../progress-glow'
import { cssNumber } from '../sanitize'
import { screenPart } from './screen-part'

/**
 * The copy of the fill that makes the glow (schema 9.25.0, `x-progressGlow`): out of the flow, over
 * the box of the scale, blurred by the standard deviation of the word and softened by its opacity.
 * It is decoration (`aria-hidden`), takes no press and no room. The numbers are the contract's
 * (`PROGRESS_GLOW_STRENGTH`), never a string from the document.
 */
export const GlowLayer = screenPart(function GlowLayer({ glow, row, children }: { readonly glow: ProgressGlow; readonly row?: CSSProperties; readonly children: ReactNode }): ReactNode {
  const { sigma, opacity } = PROGRESS_GLOW_STRENGTH[glow]
  return (
    <div
      aria-hidden="true"
      data-hl-glow={glow}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: `blur(${cssNumber(sigma)}px)`, opacity, ...(row === undefined ? {} : { display: 'flex', ...row }) }}
    >
      {children}
    </div>
  )
})
