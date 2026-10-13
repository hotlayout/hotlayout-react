/** README examples: functions without markup: what to load for the theme and which language the screen is shown in. The README test also EXECUTES them. */
import { resolveLocale, resolveTheme } from '@hotlayout/react'
import type { ThemeContract, UiDocument } from '@hotlayout/react'

// #region fonts
/** What the page has to load for this theme: families and the weights actually used. */
export function fontsOf(contract: ThemeContract, themeId?: string) {
  const { theme } = resolveTheme(contract, themeId)
  const weights = (role: 'body' | 'heading') => [...new Set(Object.values(theme.typography).filter((style) => style.role === role).map((style) => style.fontWeight))].sort()
  return {
    body: { family: theme.fontFamilies.body.primary, weights: weights('body') },
    heading: { family: theme.fontFamilies.heading.primary, weights: weights('heading') },
  }
}
// For the built-in theme: body — Inter 400, 500, 600; heading — Inter 700.
// #endregion

// #region shown-language
/** The renderer's own texts (`labels`) in the language the screen is actually shown in. */
const BACK_LABELS: Readonly<Record<string, string>> = { en: 'Back', ar: 'رجوع', uk: 'Назад' }

export function backLabelFor(document: UiDocument, deviceLocale: string): string {
  const { translation } = resolveLocale(deviceLocale, document.localization?.locales ?? [], document.localization?.defaultLocale)
  return BACK_LABELS[translation ?? 'en'] ?? 'Back'
}
// backLabelFor(layout, 'ar-EG') → 'رجوع' when the document has `ar`; 'Back' when it only has `ar-SA` or no Arabic at all
// #endregion
