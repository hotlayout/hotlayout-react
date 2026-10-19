/**
 * The anatomy of a screen from the props of the host (`scroll`, `chrome`, the sticky offsets
 * and the two safe-area insets). An unknown word is the default one.
 */
import { safeBottomInset, safeStickyOffset } from '../sanitize'
import { safeTopInset } from '../screen-top'
import type { ScreenAnatomy } from './contexts'

export interface AnatomyHostProps {
  readonly scroll?: unknown
  readonly chrome?: unknown
  readonly stickyOffset?: unknown
  readonly stickyBottomOffset?: unknown
  readonly safeAreaBottom?: unknown
  readonly safeAreaTop?: unknown
  readonly trapFocus?: unknown
}

export function anatomyOf(host: AnatomyHostProps): ScreenAnatomy {
  const offset = safeStickyOffset(host.stickyOffset)
  const bottomOffset = safeStickyOffset(host.stickyBottomOffset)
  return {
    scroll: host.scroll === 'screen' ? 'screen' : 'page',
    chrome: host.chrome === 'static' ? 'static' : 'sticky',
    modal: false,
    trapFocus: host.trapFocus === true,
    safeBottom: safeBottomInset(host.safeAreaBottom),
    safeTop: safeTopInset(host.safeAreaTop),
    ...(offset === undefined ? {} : { stickyOffset: offset }),
    ...(bottomOffset === undefined ? {} : { stickyBottomOffset: bottomOffset }),
  }
}
