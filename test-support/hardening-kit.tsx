/**
 * Shared helpers for the October 2026 hardening review: fixtures, leaves of a JSON value, the
 * sinks of server markup, and a screen renderer that turns a caught render exception into a
 * visible marker so a server render can be checked for it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

import { contractFile } from './paths'
import { HotlayoutScreen } from '../src/index'
import type { HotlayoutScreenProps, UiDocument } from '../src/index'

export type Path = readonly (string | number)[]

export interface Fixture {
  readonly name: string
  readonly document: UiDocument
}

/** Every screen document among the contract fixtures (files at the top level with `screens`). */
export function screenFixtures(): readonly Fixture[] {
  const dir = contractFile('fixtures')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ name: file, document: JSON.parse(readFileSync(contractFile(`fixtures/${file}`), 'utf8')) as UiDocument }))
    .filter((fixture) => Array.isArray((fixture.document as { screens?: unknown }).screens))
}

export function leavesOf(value: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (Array.isArray(value)) value.forEach((item, index) => leavesOf(item, [...path, index], out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) leavesOf(item, [...path, key], out)
  else out.push(path)
  return out
}

export function valueAt(value: unknown, path: Path): unknown {
  let cursor: unknown = value
  for (const key of path) cursor = (cursor as Record<string | number, unknown> | undefined)?.[key]
  return cursor
}

export function replaced<T>(value: T, path: Path, next: unknown): T {
  const copy = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last !== undefined) cursor[last] = next
  return copy
}

/** The document showing the screen a leaf belongs to (`screens[i]…`), or the document as is. */
export function showingScreenOf(document: UiDocument, path: Path): UiDocument {
  if (path[0] !== 'screens' || typeof path[1] !== 'number') return document
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screens[path[1]]?.screenId
  return typeof id === 'string' ? ({ ...document, initialScreenId: id }) : document
}

export const decode = (text: string): string => text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')

/** The CSS and the addresses in the markup: the attributes `style`, `src`, `srcset`, `href`. */
export function sinksOf(html: string): readonly string[] {
  return [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))
}

/** Marker a screen exception leaves in the markup (`renderError`). */
export const THREW = 'data-test-threw'

export const silent = (): void => undefined

export function serverMarkup(document: UiDocument, extra: Partial<HotlayoutScreenProps> = {}): string {
  return renderToStaticMarkup(
    <HotlayoutScreen
      document={document}
      injectStyles={false}
      onReport={silent}
      scroll="screen"
      renderError={({ message }) => <b {...{ [THREW]: '' }}>{message}</b>}
      {...extra}
    />,
  )
}

/** The extreme numbers a network document (`JSON.parse('1e309')` is Infinity) or host data can carry. */
export const EXTREMES: readonly (readonly [string, number])[] = [
  ['1e300', 1e300],
  ['-1e300', -1e300],
  ['1e-300', 1e-300],
  ['-0', -0],
  ['Infinity (JSON 1e309)', JSON.parse('1e309') as number],
  ['-Infinity', -Infinity],
  ['NaN', Number.NaN],
]

/** A style or address value that carries a number no browser should be handed. */
export function badNumberIn(raw: string): string | undefined {
  // Hex colours (`#1e2a3b`), custom property names and identifiers are not numbers; a letter right after a digit is a unit or an exponent and stays.
  const sink = raw
    .replace(/#[0-9a-f]{3,8}\b/gi, '#')
    .replace(/--[\w-]+/g, '--v')
    .replace(/(?<![\d.])[A-Za-z_][\w-]*/g, (word) => (/^(?:NaN|Infinity)/.test(word) ? word : 'w'))
  if (/NaN|Infinity/.test(sink)) return `NaN or Infinity (${/.{0,40}(?:NaN|Infinity).{0,20}/.exec(sink)?.[0] ?? ''})`
  const exponent = /\d(?:\.\d+)?e[+-]?\d+/i.exec(sink)
  if (exponent !== null) return `an exponent (${/.{0,30}$/.exec(sink.slice(0, exponent.index + 12))?.[0] ?? ''})`
  const huge = /(?<![\w.])-?\d{7,}(?:\.\d+)?/.exec(sink)
  if (huge !== null) return `a seven-digit number (${huge[0]})`
  return undefined
}
