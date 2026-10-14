/**
 * Which placeholder of an image is reported and which is not.
 *
 * An address the image policy REFUSED is an input the reader ignored, so the host is told. An image
 * that has no address at all is not a mistake of the document: data may simply not be there yet, and
 * the placeholder is the designed look of that state.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutReport, UiDocument } from './index'

afterEach(cleanup)

function documentWith(children: readonly unknown[]): UiDocument {
  return {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'doc',
    name: 'Doc',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

const literal = (id: string, url: string): unknown => ({ id, type: 'Image', props: { source: { kind: 'url', url }, aspectRatio: '1:1', alt: id } })
const bound = (id: string, path: string): unknown => ({ id, type: 'Image', props: { source: { kind: 'binding', path, fallback: 'banner' }, aspectRatio: '1:1', alt: id } })

interface Drawn {
  readonly reports: readonly HotlayoutReport[]
  readonly node: (id: string) => Element | null
}

function draw(children: readonly unknown[], data: Record<string, unknown> = {}): Drawn {
  const reports: HotlayoutReport[] = []
  const view = render(<HotlayoutScreen document={documentWith(children)} data={data} onReport={(report) => reports.push(report)} />)
  return { reports, node: (id) => view.container.querySelector(`[data-hl-node="${id}"]`) }
}

const REFUSED = 'only absolute https: image addresses are loaded by default; a placeholder is drawn'

describe('an address the policy refused: a placeholder AND a report', () => {
  it.each([
    ['http:', 'http://cdn.example/a.png'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['relative', '/images/a.png'],
    ['protocol-relative', '//cdn.example/a.png'],
    ['blob:', 'blob:https://app.example/1'],
  ])('%s in the document', (_name, url) => {
    const { reports, node } = draw([literal('pic', url)])
    expect(node('pic')?.tagName).toBe('DIV')
    expect(node('pic')?.getAttribute('role')).toBe('img')
    expect(reports).toEqual([{ kind: 'ignored-input', where: `image address “${url}”`, reason: REFUSED }])
  })

  it.each([
    ['http:', 'http://cdn.example/a.png'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['relative', 'images/a.png'],
  ])('%s in the data', (_name, url) => {
    const { reports, node } = draw([bound('pic', 'item.image')], { 'item.image': url })
    expect(node('pic')?.getAttribute('role')).toBe('img')
    expect(reports).toEqual([{ kind: 'ignored-input', where: `image address “${url}”`, reason: REFUSED }])
  })

  it('a script address is refused whatever the host allows', () => {
    const reports: HotlayoutReport[] = []
    render(<HotlayoutScreen document={documentWith([literal('pic', 'javascript:alert(1)')])} resolveImageUrl={(url) => url} onReport={(report) => reports.push(report)} />)
    expect(reports).toEqual([{ kind: 'ignored-input', where: 'image address “javascript:alert(1)”', reason: 'a script address is never an image; a placeholder is drawn' }])
  })

  it('the same refused address on two images is one report', () => {
    const { reports } = draw([literal('one', 'http://cdn.example/a.png'), literal('two', 'http://cdn.example/a.png')])
    expect(reports).toHaveLength(1)
  })

  it('an https: address is loaded and nothing is reported', () => {
    const { reports, node } = draw([literal('pic', 'https://cdn.example/a.png')])
    expect(node('pic')?.getAttribute('src')).toBe('https://cdn.example/a.png')
    expect(reports).toEqual([])
  })
})

describe('no address at all: a placeholder and NO report', () => {
  it.each([
    ['the data has no value', {}],
    ['the value is an empty string', { 'item.image': '' }],
    ['the value is null', { 'item.image': null }],
    ['the value is not a string', { 'item.image': 7 }],
  ])('%s', (_name, data) => {
    const { reports, node } = draw([bound('pic', 'item.image')], data)
    expect(node('pic')?.getAttribute('role')).toBe('img')
    expect(node('pic')?.getAttribute('data-hl-asset')).toBe('banner')
    expect(reports).toEqual([])
  })

  it('an empty address in the document', () => {
    const { reports, node } = draw([literal('pic', '')])
    expect(node('pic')?.getAttribute('role')).toBe('img')
    expect(reports).toEqual([])
  })

  it('an asset token the host gave no address for', () => {
    const { reports, node } = draw([{ id: 'pic', type: 'Image', props: { source: { kind: 'asset', asset: 'logo' }, aspectRatio: '1:1', alt: 'logo' } }])
    expect(node('pic')?.getAttribute('data-hl-asset')).toBe('logo')
    expect(reports).toEqual([])
  })

  it('an allowed address that failed to load in the browser', () => {
    const { reports, node } = draw([literal('pic', 'https://cdn.example/missing.png')])
    const image = node('pic')
    expect(image?.tagName).toBe('IMG')
    if (image !== null) fireEvent.error(image)
    expect(node('pic')?.getAttribute('data-hl-image')).toBe('failed')
    expect(reports).toEqual([])
  })
})
