/**
 * Writing direction for the language the document is SHOWN in.
 *
 * The answer comes from the standard (CLDR via `Intl.Locale`), not from a list of languages kept
 * here: such a list would have to be identical in every reader, and they would diverge silently
 * on a language one of them forgot. Direction is a property of the SCRIPT: `ku` (Latin) is LTR,
 * `ckb` (Arabic script) is RTL.
 */
export type TextDirection = 'ltr' | 'rtl'

/**
 * A fallback list, only for engines without `textInfo` (an old Node during SSR). It is not the
 * source of truth: an unknown language gives `ltr` here, because that error is cheaper (LTR for
 * an RTL language looks unusual; RTL for an LTR language looks broken).
 */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'ps', 'sd', 'ug', 'ur', 'yi'])

interface TextInfoCarrier {
  readonly textInfo?: { readonly direction?: string }
  readonly getTextInfo?: () => { readonly direction?: string }
}

/** Writing direction for a language tag. An empty string, garbage and an unknown language give `ltr`. */
export function directionOf(locale: string | null | undefined): TextDirection {
  if (locale === null || locale === undefined || locale.trim() === '') return 'ltr'

  try {
    const parsed = new Intl.Locale(locale) as unknown as TextInfoCarrier
    // Both forms on purpose: some engines expose a property, others a method.
    const info = parsed.textInfo ?? parsed.getTextInfo?.()
    if (info?.direction === 'rtl') return 'rtl'
    if (info?.direction === 'ltr') return 'ltr'
  } catch {
    // An invalid language tag: the fallback list below applies and also yields `ltr`.
  }

  const language = locale.toLowerCase().split(/[-_]/)[0] ?? ''
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
}
