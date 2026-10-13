/**
 * WHICH LANGUAGE TO SHOW A DOCUMENT IN (schema 9.1.0): a mirror of the contract's reference
 * implementation (the package does not import the builder's sources). The two are held together
 * by the shared case table `contract/fixtures/locale/locale-cases.json`.
 *
 * The host passes the DEVICE locale (`ar-EG`, `pt_BR`); the document has translations under
 * short codes (`ar`, `pt`). The rule is the contract's policy rows:
 *
 *  - `localeNormalization`: `_` is the same as `-`; case does not matter;
 *  - `localeMatching: 'bcp47-lookup-truncate'`: exact match, then drop the last part (RFC 4647
 *    Lookup): `zh-Hant-TW` -> `zh-Hant` -> `zh`;
 *  - `localeChildFallback: 'none'`: `ar` does NOT find `ar-EG`; `pt` cannot guess `pt-BR` or
 *    `pt-PT`;
 *  - `unmatchedLocale: 'use-default-locale'`: nothing found means the source language;
 *  - `localeResolution: 'once-per-document'`: one answer per document;
 *  - `directionFollows: 'shown-translation-locale'`: the direction follows the language of the
 *    SHOWN text, not the requested one;
 *  - `formattingLocale: 'requested-when-matched-else-default'`: dates are written in the
 *    requested locale if a translation was found, and in the source language if not.
 *
 * KNOWN LIMIT: `zh-TW` falls to `zh` (usually Simplified). The right answer needs script data
 * that is not identical across platforms.
 */

/**
 * The longest string that is considered a language tag at all. The longest tag in the IANA
 * registry is thirty-five characters; a hundred leaves room for extensions.
 */
export const MAX_LOCALE_TAG_LENGTH = 100

/** A tag part: Latin letters and digits, one to eight. */
const SUBTAG_PATTERN = /^[A-Za-z0-9]{1,8}$/
/** The first part is the language: letters only, at least two (`x-...` and `i-...` are not languages). */
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}$/
const SCRIPT_PATTERN = /^[A-Za-z]{4}$/
const REGION_PATTERN = /^[A-Za-z]{2}$/

/**
 * The tag in canonical form, or `undefined` if it is not a language tag.
 *
 * Canonical form follows BCP 47 custom (RFC 5646, 2.1.1): language lowercase, script
 * capitalized (`Hant`), region uppercase (`EG`), everything after an extension singleton
 * lowercase. Comparison ignores case; the canonical form exists so that the format locale is the
 * same STRING in every reader.
 *
 * Not a tag: not a string, empty, an empty part (`ar--EG`), not Latin, the first part is not a
 * language, longer than `MAX_LOCALE_TAG_LENGTH`. All of these mean "no language was asked for".
 */
export function normalizeLocaleTag(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_LOCALE_TAG_LENGTH) return undefined
  const parts = raw.trim().replaceAll('_', '-').split('-')
  const language = parts[0]
  if (language === undefined || !LANGUAGE_PATTERN.test(language)) return undefined
  if (!parts.every((part) => SUBTAG_PATTERN.test(part))) return undefined

  let afterSingleton = false
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase()
      if (afterSingleton) return part.toLowerCase()
      if (part.length === 1) {
        afterSingleton = true
        return part.toLowerCase()
      }
      if (SCRIPT_PATTERN.test(part)) return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
      if (REGION_PATTERN.test(part)) return part.toUpperCase()
      return part.toLowerCase()
    })
    .join('-')
}

/**
 * Lookup chain: the tag itself and everything left after dropping parts. `zh-Hant-TW` ->
 * `zh-Hant-TW`, `zh-Hant`, `zh`; `en-US-u-ca-gregory` -> ..., `en-US-u-ca`, `en-US`, `en`
 * (`en-US-u` is skipped: a single-letter part is never left last).
 */
export function localeLookupChain(normalized: string): readonly string[] {
  const chain: string[] = []
  if (normalized.length > MAX_LOCALE_TAG_LENGTH) return chain
  // Prefixes are taken by slicing at the hyphen position: parts are not re-joined at every step.
  let end = normalized.length
  while (end > 0) {
    chain.push(normalized.slice(0, end))
    end = normalized.lastIndexOf('-', end - 1)
    // A single-letter part is never left last; it goes together with the previous one.
    while (end > 0 && (end === 1 || normalized.charAt(end - 2) === '-')) end = normalized.lastIndexOf('-', end - 1)
  }
  return chain
}

/**
 * The tag shape the date and number engine accepts (BCP 47 as Unicode reads it): language (2-3
 * or 5-8 letters), then optional script (4 letters), region (2 letters or 3 digits), variants
 * (5-8 characters, or a digit and three characters), extensions (a singleton letter and at least
 * one part of 2-8 characters) and a private-use part `x-...`. Applied to the CANONICAL form.
 */
const WELL_FORMED_PATTERN =
  /^(?:[a-z]{2,3}|[a-z]{5,8})(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[a-wyz0-9](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?$/

/**
 * The longest prefix of a tag with a valid shape: `ja-JP-JP` -> `ja-JP`, `ar-EG-u` -> `ar-EG`,
 * `en-US-u-ca-gregory` is its own answer. `undefined` means there is no such prefix.
 *
 * The question is about SHAPE, not "does this engine accept it": the engine's answer would
 * differ between platforms, and the format locale would stop being the same string across
 * readers. An engine that rejects even such a tag drops parts further by itself; that is the
 * reader's business, not the rule's.
 */
export function wellFormedLocaleTag(normalized: string | undefined): string | undefined {
  if (normalized === undefined) return undefined
  return localeLookupChain(normalized).find((candidate) => WELL_FORMED_PATTERN.test(candidate))
}

export interface LocaleResolution {
  /**
   * The language the texts are shown in: a key of the document's
   * `localization.locales`, spelled exactly as the document spells it, or the
   * document's own language. `undefined` only for a document without
   * localization.
   */
  readonly translation: string | undefined
  /**
   * The locale dates are formatted with, in canonical BCP 47 spelling: the
   * requested locale when a translation was found, the document's own language
   * otherwise. `undefined` — nobody named a language: the device locale.
   */
  readonly formatting: string | undefined
  /**
   * The tag the writing direction is taken from — the language of the text
   * that is actually SHOWN, not the one that was asked for.
   */
  readonly directionLocale: string | undefined
  /** Whether the requested locale was found, exactly or by dropping subtags. */
  readonly matched: boolean
}

/**
 * Which language a document is shown in when the host asks for `requested`.
 *
 * The lookup is RFC 4647 "Lookup": `_` equals `-`, case does not matter, and
 * subtags are dropped from the end until a language of the document matches
 * (`ar-EG` → `ar`, `zh-Hant-TW` → `zh-Hant` → `zh`). It never goes the other
 * way: `ar` does not pick `ar-EG`. No match — the document's own language.
 *
 * `HotlayoutScreen` does this itself; call it when your own chrome (the
 * `labels`, a page title) has to speak the same language as the screen.
 *
 * @param requested the locale of the user, as the platform gives it
 * @param available `document.localization.locales`
 * @param source `document.localization.defaultLocale`; `undefined` — the document has no localization
 */
export function resolveLocale(
  requested: string | null | undefined,
  available: readonly string[],
  source: string | undefined,
): LocaleResolution {
  const asked = normalizeLocaleTag(requested)
  // The format locale is only a tag of valid shape: otherwise the date engine throws on it.
  const askedFormat = wellFormedLocaleTag(asked)

  // A document without localization names no language: the only word about it is the host's.
  if (source === undefined) {
    return { translation: undefined, formatting: askedFormat, directionLocale: askedFormat ?? asked, matched: false }
  }

  const canonical = (locale: string): string => normalizeLocaleTag(locale) ?? locale
  const unmatched: LocaleResolution = {
    translation: source,
    formatting: wellFormedLocaleTag(normalizeLocaleTag(source)) ?? canonical(source),
    directionLocale: canonical(source),
    matched: false,
  }
  if (asked === undefined) return unmatched

  // Comparison key -> DOCUMENT key. The first in the list wins over a twin that differs only in
  // case (the schema does not allow that, but the document may have been assembled by something
  // other than the builder).
  const keys = new Map<string, string>()
  for (const locale of [...available, source]) {
    const key = normalizeLocaleTag(locale)?.toLowerCase()
    if (key !== undefined && !keys.has(key)) keys.set(key, locale)
  }

  for (const candidate of localeLookupChain(asked)) {
    const found = keys.get(candidate.toLowerCase())
    if (found !== undefined) {
      const shown = canonical(found)
      return { translation: found, formatting: askedFormat ?? wellFormedLocaleTag(shown) ?? shown, directionLocale: shown, matched: true }
    }
  }
  return unmatched
}
