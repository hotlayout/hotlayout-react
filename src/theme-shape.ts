/**
 * A theme from the network becomes a theme that is safe to draw with.
 *
 * A theme becomes CSS variables on the screen root: a token's NAME becomes the variable's name,
 * its value the variable's value. Both come from the network, so every entry here is parsed by
 * the shape the theme schema gives (`sanitize.ts`):
 *
 *  - a name that is not a token name (`x:1;position:fixed;--y`) yields no entry;
 *  - a colour is only `#rrggbb[aa]`; a non-colour yields no entry;
 *  - a number is `typeof number`, clamped to the schema's bounds; a non-number yields no entry;
 *  - a shadow and a gradient are composite, each part checked separately; a layer or stop that
 *    does not parse cancels the whole token (a gradient missing one stop is a different gradient);
 *  - a typeface is a name without control characters.
 *
 * "NO ENTRY" is an already named policy: a missing core is completed by the built-in theme of the
 * same brightness (`partialTheme`, `partialThemeDefaults`), a custom token becomes "unknown"
 * (`missingCustomToken`), a role becomes neutral (`missingRole`). There is no new policy here;
 * what was discarded is listed in the report (`invalid-theme-values`).
 *
 * The number of custom names per dictionary is bounded (`x-tokens.maxCustomPerDictionary`): a
 * theme with a hundred thousand tokens is a hundred thousand variables on the host page's root.
 */
import { isRecord, MAX_CUSTOM_TOKENS, safeColor, safeFontFamily, safeIdent, safeNumber, THEME_BOUNDS } from './sanitize'
import type { Theme, ThemeGradient, ThemeRole, ThemeShadow, ThemeTypography } from './theme'

export interface SanitizedTheme {
  readonly theme: Theme
  /** What was discarded, as paths in the theme: `color.primary`, `elevation.low`. At most `MAX_REPORTED`. */
  readonly dropped: readonly string[]
}

const MAX_REPORTED = 20
/** The most layers of one shadow and stops of one gradient that the reader takes in. */
export const MAX_SHADOW_LAYERS = 8
export const MAX_GRADIENT_STOPS = 16
/** Headroom for a dictionary's core beyond custom names: the largest core is fourteen colours. */
const CORE_ALLOWANCE = 16

const bound = (value: unknown, kind: keyof typeof THEME_BOUNDS): number | undefined => safeNumber(value, THEME_BOUNDS[kind][0], THEME_BOUNDS[kind][1])

function typographyOf(raw: unknown): ThemeTypography | undefined {
  if (!isRecord(raw)) return undefined
  const fontSize = bound(raw.fontSize, 'fontSize')
  const lineHeight = bound(raw.lineHeight, 'lineHeight')
  const fontWeight = bound(raw.fontWeight, 'fontWeight')
  if (fontSize === undefined || lineHeight === undefined || fontWeight === undefined) return undefined
  const letterSpacing = bound(raw.letterSpacing, 'letterSpacing')
  return { fontSize, lineHeight, fontWeight, role: raw.role === 'heading' ? 'heading' : 'body', ...(letterSpacing === undefined ? {} : { letterSpacing }) }
}

function shadowOf(raw: unknown): readonly ThemeShadow[] | undefined {
  if (!Array.isArray(raw) || raw.length > MAX_SHADOW_LAYERS) return undefined
  const layers: ThemeShadow[] = []
  for (const layer of raw as readonly unknown[]) {
    if (!isRecord(layer)) return undefined
    const color = safeColor(layer.color)
    if (color === undefined) return undefined
    layers.push({
      offsetX: bound(layer.offsetX, 'shadowOffset') ?? 0,
      offsetY: bound(layer.offsetY, 'shadowOffset') ?? 0,
      blur: bound(layer.blur, 'shadowBlur') ?? 0,
      spread: bound(layer.spread, 'shadowSpread') ?? 0,
      color,
      opacity: layer.opacity === undefined ? 1 : (bound(layer.opacity, 'opacity') ?? 0),
    })
  }
  return layers
}

function gradientOf(raw: unknown): ThemeGradient | undefined {
  if (!isRecord(raw) || typeof raw.angle !== 'number' || !Number.isFinite(raw.angle)) return undefined
  if (!Array.isArray(raw.stops) || raw.stops.length > MAX_GRADIENT_STOPS) return undefined
  const stops: { color: string; position: number }[] = []
  for (const stop of raw.stops as readonly unknown[]) {
    if (!isRecord(stop)) return undefined
    const color = safeColor(stop.color)
    const position = bound(stop.position, 'gradientPosition')
    if (color === undefined || position === undefined) return undefined
    stops.push({ color, position })
  }
  return { angle: raw.angle, stops }
}

function roleOf(raw: unknown): ThemeRole | undefined {
  if (!isRecord(raw)) return undefined
  const foreground = safeIdent(raw.foreground)
  if (foreground === undefined) return undefined
  const background = safeIdent(raw.background)
  const border = safeIdent(raw.border)
  return { foreground, ...(background === undefined ? {} : { background }), ...(border === undefined ? {} : { border }) }
}

function familyOf(raw: unknown): { readonly primary: string; readonly fallback: readonly string[] } | undefined {
  if (!isRecord(raw) || safeFontFamily(raw.primary) === undefined) return undefined
  const fallback = Array.isArray(raw.fallback) ? (raw.fallback as readonly unknown[]).filter((name): name is string => safeFontFamily(name) !== undefined).slice(0, 8) : []
  return { primary: raw.primary as string, fallback }
}

/**
 * A theme of any shape becomes a `Theme` in which every value has the schema's shape. Never
 * throws. What already has the right shape is left unchanged.
 */
export function sanitizeTheme(raw: unknown, fallbackId = ''): SanitizedTheme {
  const source = isRecord(raw) ? raw : {}
  const dropped: string[] = []
  const drop = (path: string): void => {
    if (dropped.length < MAX_REPORTED) dropped.push(path.slice(0, 80))
  }

  function dictionary<T>(name: string, parse: (value: unknown) => T | undefined): Record<string, T> {
    const result: Record<string, T> = {}
    const table = source[name]
    if (table === undefined) return result
    if (!isRecord(table)) {
      drop(name)
      return result
    }
    let kept = 0
    for (const key of Object.keys(table)) {
      if (kept >= MAX_CUSTOM_TOKENS + CORE_ALLOWANCE) {
        drop(`${name} (more than ${String(MAX_CUSTOM_TOKENS + CORE_ALLOWANCE)} entries)`)
        break
      }
      const parsed = safeIdent(key) === undefined ? undefined : parse(table[key])
      if (parsed === undefined) {
        drop(`${name}.${key}`)
        continue
      }
      result[key] = parsed
      kept += 1
    }
    return result
  }

  const fontFamilies: Record<string, { readonly primary: string; readonly fallback: readonly string[] }> = {}
  if (isRecord(source.fontFamilies)) {
    for (const role of ['body', 'heading'] as const) {
      if (!Object.hasOwn(source.fontFamilies, role)) continue
      const family = familyOf(source.fontFamilies[role])
      if (family === undefined) drop(`fontFamilies.${role}`)
      else fontFamilies[role] = family
    }
  } else if (source.fontFamilies !== undefined) drop('fontFamilies')

  const theme = {
    id: typeof source.id === 'string' ? source.id : fallbackId,
    name: typeof source.name === 'string' ? source.name : typeof source.id === 'string' ? source.id : fallbackId,
    brightness: source.brightness === 'dark' ? 'dark' : 'light',
    fontFamilies,
    spacing: dictionary('spacing', (value) => bound(value, 'spacing')),
    radius: dictionary('radius', (value) => bound(value, 'radius')),
    color: dictionary('color', safeColor),
    typography: dictionary('typography', typographyOf),
    elevation: dictionary('elevation', shadowOf),
    gradient: dictionary('gradient', gradientOf),
    roles: dictionary('roles', (group) => {
      if (!isRecord(group)) return undefined
      const roles: Record<string, ThemeRole> = {}
      for (const name of Object.keys(group).slice(0, MAX_CUSTOM_TOKENS)) {
        const role = safeIdent(name) === undefined ? undefined : roleOf(group[name])
        if (role === undefined) drop(`roles.${name}`)
        else roles[name] = role
      }
      return roles
    }),
  }
  // Typefaces may be incomplete until `resolveMissingToDefaults`; the type does not know that.
  return { theme: theme as unknown as Theme, dropped }
}
