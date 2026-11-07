/**
 * Server render under a hostile document: the markup-injection check and the sweep that puts a
 * markup payload into every string leaf and every object of every fixture, as a value and as a
 * KEY. The sweep is cut into slices (`shard.ts`) that `hardening-2026-10/ssr.<k>.deep.test.tsx`
 * run in parallel.
 */
import { renderToString } from 'react-dom/server'
import { it } from 'vitest'

import { HOTLAYOUT_CSS, HotlayoutScreen } from '../src/index'
import type { UiDocument } from '../src/index'
import { leavesOf, replaced, screenFixtures, showingScreenOf, valueAt } from './hardening-kit'
import type { Fixture, Path } from './hardening-kit'
import { shardOf } from './shard'

/** How many files the sweep is cut into: `ssr.<1..N>.deep.test.tsx`. */
export const SSR_SLICE_COUNT = 12

export const PAYLOAD = `</div></style></script><script>alert(1)</script><style>*{display:none}</style><img src=x onerror=alert(1)><!--`

/**
 * Whether the payload became markup. React escapes `<` in text and in attribute values, so the
 * payload can only act through a raw `<`: a tag the payload names, or a comment other than the
 * `<!-- -->` React puts between text nodes. `onerror=` inside an escaped attribute value is text.
 */
export function injected(html: string): string | undefined {
  const tag = /<(script|style|iframe|object|embed|meta|base|form|img src=x)\b/i.exec(html)
  if (tag !== null) return `<${tag[1] ?? ''}`
  if (/<!--(?! -->)/.test(html)) return 'a comment'
  return undefined
}

/** With the package stylesheet: its one `<style>` is cut out, so what remains must hold no markup of the document. */
export function draw(document: UiDocument): string {
  const html = renderToString(<HotlayoutScreen document={document} onReport={() => undefined} scroll="screen" renderError={() => <b>notice</b>} />)
  return html.replace(`<style>${HOTLAYOUT_CSS}</style>`, '')
}

/** Paths of every object (not array) in a value: places where a hostile KEY can be added. */
function objectsOf(value: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (Array.isArray(value)) value.forEach((item, index) => objectsOf(item, [...path, index], out))
  else if (typeof value === 'object' && value !== null) {
    out.push(path)
    for (const [key, item] of Object.entries(value)) objectsOf(item, [...path, key], out)
  }
  return out
}

function withKey(document: UiDocument, path: Path): UiDocument {
  const copy = structuredClone(document)
  const target = (path.length === 0 ? copy : valueAt(copy, path)) as Record<string, unknown>
  target[PAYLOAD] = PAYLOAD
  return copy
}

export interface SsrCase {
  readonly fixture: Fixture
  readonly kind: 'value' | 'key'
  readonly path: Path
}

/** Every string leaf (payload as a value) and every object (payload as a key) of every fixture. */
export function ssrCases(): SsrCase[] {
  const out: SsrCase[] = []
  for (const fixture of screenFixtures()) {
    for (const path of leavesOf(fixture.document).filter((candidate) => typeof valueAt(fixture.document, candidate) === 'string')) out.push({ fixture, kind: 'value', path })
    for (const path of objectsOf(fixture.document)) out.push({ fixture, kind: 'key', path })
  }
  return out
}

/** The sweep over one slice of the cases. */
export function itSsrSweep(shard: number): void {
  it(`slice ${String(shard)}: every string leaf and every key of every fixture`, () => {
    for (const { fixture, kind, path } of shardOf(ssrCases(), shard, SSR_SLICE_COUNT)) {
      if (kind === 'value') {
        const found = injected(draw(showingScreenOf(replaced(fixture.document, path, PAYLOAD), path)))
        if (found !== undefined) throw new Error(`${fixture.name} ${path.join('.')}: “${found}” reached the HTML`)
      } else {
        const found = injected(draw(showingScreenOf(withKey(fixture.document, path), path)))
        if (found !== undefined) throw new Error(`${fixture.name} key at ${path.join('.')}: “${found}” reached the HTML`)
      }
    }
  }, 300_000 / SSR_SLICE_COUNT + 60_000)
}
