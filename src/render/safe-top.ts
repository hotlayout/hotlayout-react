/**
 * The top safe inset inside the box of an app bar (or of the own strip of a
 * navigation bar): the box is taller by the inset, the inset lies ABOVE its content,
 * and a named background of the bar covers it (`safeTop.withAppBar`).
 */
import type { CSSProperties } from 'react'

import { mathLength } from '../resolve'
import { NO_SAFE_TOP } from '../screen-top'
import type { Theme } from '../theme'
import { splitRootPadding } from './screen-root'

/**
 * The same box with the inset added to its top padding. The padding of the bar stays
 * below the inset: the first thing in the box is the room of the status bar.
 */
export function withTopInset(css: CSSProperties, inset: string, theme: Theme): CSSProperties {
  if (inset === NO_SAFE_TOP) return css
  const { padding, rest } = splitRootPadding(css)
  return {
    ...rest,
    paddingBlockStart: `calc(${mathLength(padding.blockStart, theme)} + ${inset})`,
    ...(padding.blockEnd === undefined ? {} : { paddingBlockEnd: padding.blockEnd }),
    ...(padding.inlineStart === undefined ? {} : { paddingInlineStart: padding.inlineStart }),
    ...(padding.inlineEnd === undefined ? {} : { paddingInlineEnd: padding.inlineEnd }),
  }
}
