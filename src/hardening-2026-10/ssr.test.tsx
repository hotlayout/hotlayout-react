/**
 * Limit 9 — server render. A hostile document under `renderToString` / `renderToStaticMarkup`
 * must neither fail the page (no exception, a screen that cannot be drawn becomes a notice) nor
 * inject markup into the HTML string. Every string leaf and every object of every fixture gets a
 * markup payload, as a value and as a KEY.
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HOTLAYOUT_CSS, HotlayoutScreen } from '../index'
import type { UiDocument } from '../index'
import { leavesOf, replaced, screenFixtures, showingScreenOf, valueAt } from '../../test-support/hardening-kit'
import type { Path } from '../../test-support/hardening-kit'

const PAYLOAD = `</div></style></script><script>alert(1)</script><style>*{display:none}</style><img src=x onerror=alert(1)><!--`

/**
 * Whether the payload became markup. React escapes `<` in text and in attribute values, so the
 * payload can only act through a raw `<`: a tag the payload names, or a comment other than the
 * `<!-- -->` React puts between text nodes. `onerror=` inside an escaped attribute value is text.
 */
function injected(html: string): string | undefined {
  const tag = /<(script|style|iframe|object|embed|meta|base|form|img src=x)\b/i.exec(html)
  if (tag !== null) return `<${tag[1] ?? ''}`
  if (/<!--(?! -->)/.test(html)) return 'a comment'
  return undefined
}

/** With the package stylesheet: its one `<style>` is cut out, so what remains must hold no markup of the document. */
function draw(document: UiDocument): string {
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

describe('limit 9: no markup injection and no failed page under a hostile document', () => {
  it('the injection check itself: the raw payload is caught, the escaped one is text', () => {
    expect(injected(PAYLOAD)).toBeDefined()
    expect(injected('<div title="&lt;/div&gt;&lt;script&gt; onerror=alert(1)">a<!-- -->b</div>')).toBeUndefined()
  })

  it('the default stylesheet the package injects is the only <style> (control: the clean screen has exactly one)', () => {
    const fixture = screenFixtures()[0]
    if (fixture === undefined) throw new Error('no fixtures')
    const html = renderToString(<HotlayoutScreen document={fixture.document} onReport={() => undefined} />)
    expect(html.split('<style').length - 1).toBe(1)
    expect(injected(draw(fixture.document))).toBeUndefined()
  })

  for (const fixture of screenFixtures()) {
    it(`${fixture.name}: every string leaf and every key`, () => {
      const strings = leavesOf(fixture.document).filter((path) => typeof valueAt(fixture.document, path) === 'string')
      for (const path of strings) {
        const html = draw(showingScreenOf(replaced(fixture.document, path, PAYLOAD), path))
        const found = injected(html)
        if (found !== undefined) throw new Error(`${fixture.name} ${path.join('.')}: “${found}” reached the HTML`)
      }
      for (const path of objectsOf(fixture.document)) {
        const html = draw(showingScreenOf(withKey(fixture.document, path), path))
        const found = injected(html)
        if (found !== undefined) throw new Error(`${fixture.name} key at ${path.join('.')}: “${found}” reached the HTML`)
      }
    }, 300_000)
  }
})
