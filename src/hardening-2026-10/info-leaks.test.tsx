/**
 * Limit 8 — information leaks. The host's data (balances, names, tokens in picture addresses) is
 * shown where the document puts it on screen and handed to the host's own callbacks — nowhere
 * else: not into `console`, not into report or error texts, not into the markup of nodes the
 * screen does not show.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from '../index'
import type { HotlayoutReport, UiDocument, UiNode } from '../index'
import { serverMarkup } from '../../test-support/hardening-kit'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SECRET = 'SECRET-4111-1111'

function screenWith(children: readonly UiNode[]): UiDocument {
  return {
    schemaVersion: '9.27.0',
    documentId: 'leaks',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

const bound = (id: string, path: string, extra: Record<string, unknown> = {}): UiNode =>
  ({ id, type: 'Text', props: { content: { kind: 'binding', path, fallback: '' }, align: 'start', overflow: 'ellipsis' }, ...extra }) as unknown as UiNode
const boundImage = (id: string, path: string): UiNode => ({ id, type: 'Image', props: { source: { kind: 'binding', path, fallback: 'logo' }, alt: 'x', fit: 'cover' } }) as unknown as UiNode

describe('limit 8: data values stay on screen', () => {
  it('a node hidden by visibleIf or by showOn leaves no data value in the markup (browser and server)', () => {
    const document = screenWith([
      bound('a', 'user.name', { visibleIf: { path: 'user.isVip', op: 'isTrue' } }),
      bound('b', 'user.name', { showOn: ['expanded'] }),
    ])
    const data = { 'user.name': SECRET, 'user.isVip': false }
    const { container } = render(<HotlayoutScreen document={document} data={data} onReport={() => undefined} initialWidthClass="compact" />)
    expect(container.innerHTML).not.toContain(SECRET)
    expect(serverMarkup(document, { data, initialWidthClass: 'compact' })).not.toContain(SECRET)
  })

  it('LIMIT DOES NOT HOLD: a refused picture address from DATA does not put its query (a token) into the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(<HotlayoutScreen document={screenWith([boundImage('p', 'item.image')])} data={{ 'item.image': `http://cdn.example.com/u/42.png?token=${SECRET}` }} />)
    const said = warn.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
    expect(said).toContain('image')
    expect(said).not.toContain(SECRET)
  })

  it('LIMIT DOES NOT HOLD: the report handed to onReport for that refusal does not carry the data value either', () => {
    const reports: HotlayoutReport[] = []
    render(<HotlayoutScreen document={screenWith([boundImage('p', 'item.image')])} data={{ 'item.image': `http://cdn.example.com/u/42.png?token=${SECRET}` }} onReport={(report) => reports.push(report)} />)
    expect(reports.length).toBeGreaterThan(0)
    expect(JSON.stringify(reports)).not.toContain(SECRET)
  })

  it('a refused DOCUMENT picture address may be named in the report: it is the document’s own text (control)', () => {
    const reports: HotlayoutReport[] = []
    const picture = { id: 'p', type: 'Image', props: { source: { kind: 'url', url: 'http://cdn.example.com/doc.png' }, alt: 'x', fit: 'cover' } } as unknown as UiNode
    render(<HotlayoutScreen document={screenWith([picture])} onReport={(report) => reports.push(report)} />)
    expect(JSON.stringify(reports)).toContain('doc.png')
  })

  it('a write the document is not allowed to make reports the path, never the value typed by the person', () => {
    const reports: HotlayoutReport[] = []
    const write = { id: 'w', type: 'Button', props: { label: { kind: 'literal', value: 'w' }, variant: 'primary', action: { type: 'setValue', params: { path: 'account.period', value: SECRET } } } } as unknown as UiNode
    const { container } = render(<HotlayoutScreen document={screenWith([write])} onReport={(report) => reports.push(report)} writablePaths={[]} onWrite={() => undefined} />)
    container.querySelector('button')?.click()
    expect(JSON.stringify(reports)).not.toContain(SECRET)
  })
})
