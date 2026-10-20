/**
 * Which theme to draw with when the host gave "some" theme.
 *
 * The theme comes from the network just like the document, so the reader cannot believe anyone
 * checked it. The theme policy (`x-compatibility.policy` in `theme.json`) answers every case,
 * and it is gathered into one function here:
 *
 *  - no theme given at all: the built-in one, with no message, since that is the host's choice;
 *  - the theme could not be read (not an object, a foreign major, no usable theme):
 *    `unreadableTheme: 'fallback-and-report'`, the built-in theme and a report. A theme is
 *    appearance, not content; a screen in slightly wrong colors is better than none;
 *  - a `themeId` that is not in the set: `unknownThemeId: 'use-default'`;
 *  - a newer minor: `newerMinor: 'read-known-fields-only'`, read by keys;
 *  - core tokens that are missing: `partialTheme: 'resolve-missing-to-defaults'`;
 *  - an own `__proto__` key: `protoKeyWithoutValidation: 'drop-entry'`.
 */
import { BUILT_IN_THEME_CONTRACT } from './built-in-theme'
import { withoutForbiddenKeys } from './guards'
import type { Theme, ThemeContract } from './theme'
import { resolveMissingToDefaults } from './theme'
import { sanitizeTheme } from './theme-shape'
import { checkVersion, READER_THEME_VERSION } from './version'

/** Something the renderer handled on its own and the host may want to log. */
export type ThemeReport =
  | { readonly kind: 'theme-fallback'; readonly reason: string }
  | { readonly kind: 'unknown-theme-id'; readonly themeId: string; readonly used: string }
  /**
   * Some theme entries do not have the shape the theme schema promises (a colour
   * that is not `#rrggbb`, a number that is not a number, a token name that is
   * not a name) and were ignored: core tokens fall back to the built-in theme of
   * the same brightness, custom tokens become unknown. A number outside the bounds
   * of the theme schema was replaced (`x-themeNumbers`): its path ends with
   * `(out of bounds: built-in value)` or `(out of bounds: nearest bound)`. `paths` lists up to 20.
   */
  | { readonly kind: 'invalid-theme-values'; readonly paths: readonly string[] }

export interface ResolvedTheme {
  readonly theme: Theme
  readonly reports: readonly ThemeReport[]
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A theme from the network -> a theme that is safe to draw with: every value has the shape from
 * the theme schema (`theme-shape.ts`), and the core is filled in with built-in values of the
 * same brightness. An entry of the wrong shape is an entry that does not exist.
 */
function completed(raw: Readonly<Record<string, unknown>>, id: string, reports: ThemeReport[]): Theme {
  const { theme, dropped } = sanitizeTheme(raw, id, BUILT_IN_THEME_CONTRACT)
  if (dropped.length > 0) reports.push({ kind: 'invalid-theme-values', paths: dropped })
  return resolveMissingToDefaults(theme, BUILT_IN_THEME_CONTRACT)
}

function builtIn(themeId: string | undefined): Theme {
  const themes = BUILT_IN_THEME_CONTRACT.themes
  const wanted = themeId !== undefined && Object.hasOwn(themes, themeId) ? themeId : BUILT_IN_THEME_CONTRACT.defaultThemeId
  const theme = themes[wanted]
  if (theme === undefined) throw new Error('@hotlayout/react: the built-in theme set is empty')
  return theme
}

/**
 * Picks the theme to draw with. Never throws on bad input: an unreadable theme
 * contract falls back to the built-in theme and says so in `reports`.
 */
export function resolveTheme(contract: unknown, themeId?: string): ResolvedTheme {
  if (contract === undefined || contract === null) return { theme: builtIn(themeId), reports: [] }

  const fallback = (reason: string): ResolvedTheme => ({ theme: builtIn(themeId), reports: [{ kind: 'theme-fallback', reason }] })

  if (!isRecord(contract)) return fallback('the theme contract is not an object')
  const version = contract.themeContractVersion
  if (typeof version !== 'string') return fallback('the theme contract has no themeContractVersion')
  const verdict = checkVersion(version, READER_THEME_VERSION)
  if (verdict.kind === 'incompatible') return fallback(`theme contract ${version} is not readable by a ${READER_THEME_VERSION} reader: ${verdict.reason}`)

  const safe = withoutForbiddenKeys(contract as unknown as ThemeContract)
  const themes: unknown = safe.themes
  if (!isRecord(themes)) return fallback('the theme contract has no themes')

  const reports: ThemeReport[] = []
  // An own key, not an index: `themes['__proto__']` would give the map's prototype, not "missing".
  const own = (id: unknown): Readonly<Record<string, unknown>> | undefined => {
    if (typeof id !== 'string' || !Object.hasOwn(themes, id)) return undefined
    const candidate = themes[id]
    return isRecord(candidate) ? candidate : undefined
  }

  const defaultId = typeof safe.defaultThemeId === 'string' ? safe.defaultThemeId : ''
  const requested = themeId === undefined ? undefined : own(themeId)
  if (requested !== undefined && themeId !== undefined) return { theme: completed(requested, themeId, reports), reports }

  const byDefault = own(defaultId)
  if (byDefault === undefined) return fallback(`the theme contract names default theme “${defaultId}”, which is not in the set`)
  if (themeId !== undefined) reports.push({ kind: 'unknown-theme-id', themeId, used: defaultId })
  return { theme: completed(byDefault, defaultId, reports), reports }
}
