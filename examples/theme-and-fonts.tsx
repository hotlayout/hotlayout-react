/** README examples: theme (built-in, custom, by URL), language and writing direction. */
import { useEffect, useState } from 'react'

import { HotlayoutScreen, loadTheme } from '@hotlayout/react'
import type { ThemeContract, UiDocument } from '@hotlayout/react'

declare const layout: UiDocument
declare const projectTheme: ThemeContract
declare const prefersDark: boolean

// #region theme
// 1. No theme: the built-in starter theme (light; `themeId="dark"` for the dark one).
export const builtIn = <HotlayoutScreen document={layout} />

// 2. Your project's theme — the parsed `theme/published.json`.
export const own = <HotlayoutScreen document={layout} theme={projectTheme} themeId={prefersDark ? 'dark' : undefined} />

// 3. The theme by URL: a designer republishes it, the app picks it up without a release.
export function Themed({ themeUrl }: { themeUrl: string }) {
  const [theme, setTheme] = useState<ThemeContract>()
  useEffect(() => {
    const controller = new AbortController()
    loadTheme(themeUrl, { signal: controller.signal })
      .then(setTheme)
      .catch(() => undefined) // no theme is not an error: the built-in one is drawn
    return () => {
      controller.abort()
    }
  }, [themeUrl])
  return <HotlayoutScreen document={layout} theme={theme} onReport={(report) => { console.warn('hotlayout', report) }} />
}
// #endregion

// #region locale
export const arabic = (
  <HotlayoutScreen
    document={layout}
    locale={navigator.language} // the user's locale as the platform gives it: `ar-EG` finds the document's `ar` — translations, Egyptian date formats, direction (rtl)
    timeZone="Africa/Cairo" // dates are written in this zone — on the server and in the browser alike
    labels={{ back: 'رجوع' }} // the accessible name of the back arrow is the renderer's text, so it is yours to translate
  />
)

// A language the document has no translation for is shown in the document's own language,
// and the direction follows what is actually shown. Force it only if you know better:
export const forced = <HotlayoutScreen document={layout} locale="en" dir="rtl" />
// #endregion
