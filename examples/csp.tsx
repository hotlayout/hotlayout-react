/** README example: strict CSP, with the stylesheet as a file and no inline <style>. */
// #region csp
import '@hotlayout/react/styles.css'

import { HotlayoutScreen } from '@hotlayout/react'
import type { UiDocument } from '@hotlayout/react'

export function StrictCsp({ layout }: { layout: UiDocument }) {
  return <HotlayoutScreen document={layout} injectStyles={false} />
}
// #endregion
