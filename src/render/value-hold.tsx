/**
 * The layout of a moving number is held by its FINAL value (`x-valueLayout`, a clarification of
 * schema 9.21.0 and 9.24.0). While a number counts (`animateChanges`) or grows from zero
 * (`animateIn`), the text takes the place of its final text and the value between is only painted
 * there: the line breaks and the height of the box do not change on the frames of the motion.
 *
 *  - the first child is the FINAL text, transparent: the layout measures it and the screen reader
 *    hears it;
 *  - the second is the text being shown, out of the flow over the whole first one, with figures of
 *    equal width; the screen reader does not hear it.
 *
 * A text longer than the final one may overflow the box for the frames of the motion: it is not
 * measured. A clamp (`maxLines`) cuts both as it cuts the final text.
 */
import type { CSSProperties, ReactNode } from 'react'

const HOLD: CSSProperties = { display: 'block', position: 'relative' }
const PAINTED: CSSProperties = { display: 'block', position: 'absolute', inset: 0, fontVariantNumeric: 'tabular-nums' }

/** The final lines in the flow and the shown lines over them; `clamp` is the line clamp of the text, if any. */
export function heldLines(final: ReactNode, shown: ReactNode, clamp: CSSProperties = {}): ReactNode {
  return (
    <span data-hl-value-hold="" style={HOLD}>
      <span data-hl-value-final="" style={{ display: 'block', ...clamp, opacity: 0 }}>
        {final}
      </span>
      <span data-hl-value-shown="" aria-hidden style={{ ...PAINTED, ...clamp }}>
        {shown}
      </span>
    </span>
  )
}
