/** README example: adaptive layout, for a host that knows the width class in advance. */
import { HotlayoutScreen } from '@hotlayout/react'
import type { ThemeContract, UiDocument, WidthClass } from '@hotlayout/react'

// #region adaptive
/** The class of the place in the words of the document: below 600 CSS pixels `compact`, from 600 `medium`, from 1024 `expanded`. */
function classOfPlace(width: number | undefined): WidthClass | undefined {
  if (width === undefined) return undefined
  return width >= 1024 ? 'expanded' : width >= 600 ? 'medium' : 'compact'
}

export function Home({ layout, theme, columnWidth }: { layout: UiDocument; theme: ThemeContract; columnWidth: number | undefined }) {
  // The reader measures its own root element and switches to the real class after the first layout.
  // If you already know the width of the place (a desktop site, a column of a fixed width), say so:
  // the server markup and the first browser frame then have the final layout, and nothing jumps after hydration.
  return <HotlayoutScreen document={layout} theme={theme} initialWidthClass={classOfPlace(columnWidth)} />
}
// #endregion
