/**
 * Translation of screen texts.
 *
 * These are the texts the app's END USER sees, and they are part of the document; they are
 * unrelated to the language of any authoring tool's own interface.
 */
import type { LocaleResolution } from './locale'
import { resolveLocale } from './locale'
import type { LocalizationSection } from './types'

/**
 * A translation key describes the PLACE: `screen/node/field`.
 *
 * Not the text itself, which matters more than it seems. If the text were the key, two identical
 * labels with different meanings ("Done" as a status and "Done" as a button) would share one
 * translation, and fixing one of them would become impossible.
 */
export function translationKey(screenId: string, nodeId: string, field: string): string {
  return `${screenId}/${nodeId}/${field}`
}

/**
 * The text in the EFFECTIVE translation language, or `undefined` when there is no translation.
 *
 * `translation` is already the ANSWER of `resolveLocale`: a key from the document's language
 * list, spelled as in the document, or the source language. A device locale (`ar-EG`) never
 * arrives here: there is one answer per document, and resolving the language again for each
 * string would let two strings on one screen show in different languages.
 *
 * `undefined` rather than an empty string: a missing translation means "take the text from the
 * document" (`missingTranslation`), while an empty string is a legitimate translation by which
 * the author deliberately removed the label.
 */
export function translate(
  localization: LocalizationSection | undefined,
  translation: string | undefined,
  key: string,
): string | undefined {
  const section: unknown = localization
  if (typeof section !== 'object' || section === null || localization === undefined || translation === undefined) return undefined
  // The document's own language is the texts in the document itself; the table has no separate
  // entry for it.
  if (translation === localization.defaultLocale) return undefined
  // `strings` maps language to (place key to text), not the other way round. Own keys only, not
  // inherited ones: `constructor` is a legitimate tag by form.
  const table: unknown = localization.strings
  if (typeof table !== 'object' || table === null || !Object.hasOwn(table, translation)) return undefined
  const strings = (table as Readonly<Record<string, unknown>>)[translation]
  if (typeof strings !== 'object' || strings === null || !Object.hasOwn(strings, key)) return undefined
  const text = (strings as Readonly<Record<string, unknown>>)[key]
  return typeof text === 'string' ? text : undefined
}

/**
 * The language to show THIS document in when the host asks for `requested`.
 *
 * One answer to three questions (whose texts, whose date format, whose writing direction),
 * computed once per document (`locale.ts`).
 *
 * A DOCUMENT LANGUAGE IS ONE IN WHICH THE DOCUMENT HAS AT LEAST ONE STRING. A language named in `locales` whose `strings` table is empty or absent does not
 * count: all the text would be the source text anyway, while the writing direction and date
 * format would be foreign (an English screen laid out right to left). The same rule resolves
 * case-variant twins (`ar-EG` and `ar-eg` in the list): the answer is the spelling under which
 * translations EXIST, since that is what the table is read by. The source language is always
 * available: its texts are the document itself.
 */
export function resolveDocumentLocale(localization: LocalizationSection | null | undefined, requested: string | null | undefined): LocaleResolution {
  if (typeof localization !== 'object' || localization === null || typeof localization.defaultLocale !== 'string') return resolveLocale(requested, [], undefined)
  const locales: unknown = localization.locales
  const table: unknown = localization.strings
  const hasStrings = (locale: unknown): locale is string => {
    if (typeof locale !== 'string') return false
    if (locale === localization.defaultLocale) return true
    if (typeof table !== 'object' || table === null || !Object.hasOwn(table, locale)) return false
    const strings = (table as Readonly<Record<string, unknown>>)[locale]
    if (typeof strings !== 'object' || strings === null) return false
    // One string is enough: a partly translated language is shown, and the rest falls back to the source text.
    for (const key in strings) if (Object.hasOwn(strings, key) && typeof (strings as Readonly<Record<string, unknown>>)[key] === 'string') return true
    return false
  }
  const available = Array.isArray(locales) ? (locales as readonly unknown[]).filter(hasStrings) : []
  return resolveLocale(requested, available, localization.defaultLocale)
}
