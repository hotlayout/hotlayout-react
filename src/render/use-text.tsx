/** The text of a field (translation, binding, literal, template) and the text and colour of a part of a composite widget. */
import { useContext } from 'react'
import type { CSSProperties } from 'react'

import { readBindable } from '../data'
import { translate, translationKey } from '../localization'
import { typographyCss } from '../resolve'
import { isRecord } from '../sanitize'
import { partColorCss, typographyToCss } from '../style'
import type { TextStyleContext } from '../style'
import { templateRuns } from '../text-template'
import type { TemplateLanguage, TemplateRun } from '../text-template'
import { productVar } from '../theme'
import type { BindableString } from '../types'
import { IssueContext, PlaceContext, useData, useTheme } from './contexts'
import { asCss } from './prop-tokens'

export function asBindable(value: unknown): BindableString | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const kind = (value as { kind?: unknown }).kind
  return kind === 'literal' || kind === 'binding' ? (value as BindableString) : undefined
}

/**
 * The text of a field: a translation, then a binding, then a literal.
 *
 * The order is exactly this. A translation replaces the LITERAL, not a value from the data: a
 * binding leads to the backend, and translating what the backend already returned in the right
 * language would replace it with our own text.
 *
 * A TEMPLATE (`kind: 'template'`, schema 9.4.0) is the third kind, and only here: a string with a
 * length limit (`ChoiceGroup.value`) has no template. The whole STRING is translated, and the plural
 * forms by place keys (`<place>.template`, `<place>.values.<name>.forms.<category>`); the values are
 * not tied to a language. The data is the same scope as for a standalone binding: the row record and
 * the layers are already composed in `DataContext`. The rule is `text-template.ts`.
 *
 * A string of an unknown kind is an empty place (`unknownStringKind: 'render-empty'`).
 */
export function useText(value: unknown, field?: string): string {
  return useTextParts(value, field).text
}

/**
 * The text of a field and, for a template, its PIECES in the logical order of the string of the
 * effective language (`runs`): rich text (schema 9.6.0) splits the string with the same parser as
 * the substitution, so the text and the pieces cannot diverge. For a non-template there are no
 * `runs`.
 */
export function useTextParts(value: unknown, field?: string): { readonly text: string; readonly runs: readonly TemplateRun[] | undefined } {
  const scope = useData()
  const place = useContext(PlaceContext)
  const report = useContext(IssueContext)

  if (isRecord(value) && value.kind === 'template') {
    const { localization, shown } = place
    const key = field === undefined ? undefined : translationKey(place.screenId, place.nodeId, field)
    const language: TemplateLanguage = {
      translationLocale: shown.translation,
      sourceLocale: isRecord(localization) && typeof localization.defaultLocale === 'string' ? localization.defaultLocale : undefined,
      translated: (subPath) => (key === undefined ? undefined : translate(localization, shown.translation, `${key}.${subPath}`)),
    }
    const runs = templateRuns(
      value,
      language,
      { scope, formattingLocale: shown.formatting, fallbackLocale: shown.directionLocale, timeZone: place.timeZone, now: place.now },
      report,
      `node “${place.nodeId}”: ${field ?? 'text'}`,
    )
    return { text: runs.map((run) => run.text).join(''), runs }
  }

  const bindable = asBindable(value)
  if (field !== undefined && bindable?.kind === 'literal') {
    const translated = translate(place.localization, place.shown.translation, translationKey(place.screenId, place.nodeId, field))
    if (translated !== undefined) return { text: translated, runs: undefined }
  }

  // The format (`binding.format`) uses the requested locale if a translation was found, otherwise the source language (`formattingLocale`).
  // A locale the engine did not accept falls back to the language of the shown text, not to an ISO string.
  return { text: readBindable(bindable, scope, place.shown.formatting, place.timeZone, place.shown.directionLocale, place.now), runs: undefined }
}

/**
 * THE LABEL OF A COMPOSITE WIDGET (`ListTile`, `AppBar`, `Tab`, `Accordion`).
 *
 * The FONT never comes from the inherited one: a composite widget keeps its own typographic
 * hierarchy. The COLOUR follows the table `x-style.colorParts`:
 *
 *  - until nobody has named a colour, the BUILT-IN one applies (`builtInColor`), as before schema 9.0.0;
 *  - once one is named (by the node itself or an ancestor), the named one applies: the primary part
 *    as is, a secondary part with the opacity `x-style.secondaryOpacity`.
 *
 * Which tokens stand behind the built-in look (the row title font and colour) the contract does not
 * name yet; here they are the reader's own choice.
 */
export function usePartText(type: string, part: string, context: TextStyleContext, typography: string, builtInColor: string): CSSProperties {
  const theme = useTheme()
  return asCss({
    ...typographyToCss(typographyCss(typography, theme)),
    color: partColorCss(type, part, context, theme) ?? productVar('color', builtInColor),
  })
}

/** The same for a part without a font: an icon, a chevron, the "back" arrow. */
export function usePartColor(type: string, part: string, context: TextStyleContext, builtInColor: string): CSSProperties {
  const theme = useTheme()
  return { color: partColorCss(type, part, context, theme) ?? productVar('color', builtInColor) }
}
