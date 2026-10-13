/**
 * Adversarial tests for the row record that travels to the host and to the next screen
 * (schema 9.2.0).
 *
 * The surface is `source.record`: a document influences which OBJECT the host handler receives.
 * What an attacker controls: the whole document (the `Repeater.item` entity prefix, the collection
 * name, the action fields) and, partly, the data, since a backend record is parsed by `JSON.parse`
 * and may contain an own `__proto__` key. What the attacker must NOT be able to do:
 *
 *  - put into the record a key that becomes a route to the prototype in the host app
 *    (`set(state, key, value)`), or a value the host never supplied;
 *  - reach `onWrite` through the record, bypassing `writablePaths`;
 *  - change, from a host handler, the record the next screen opens with;
 *  - bring the screen or the app down with a record of the wrong shape.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { ActionSource, HotlayoutAction, HotlayoutReport, UiDocument, UiNode } from './index'

afterEach(cleanup)

const lit = (value: string) => ({ kind: 'literal', value })
const bound = (path: string, fallback = 'FALLBACK') => ({ kind: 'binding', path, fallback })
const node = (type: string, id: string, props: Record<string, unknown>, children?: readonly UiNode[]): UiNode => ({ id, type, props, ...(children === undefined ? {} : { children }) })
const button = (id: string, action: object): UiNode => node('Button', id, { label: lit(id), action })
const screenOf = (children: readonly UiNode[]): UiNode => node('Screen', 'root', {}, children)

function documentWith(item: unknown, rowAction: object = { type: 'submit' }, extra: readonly UiNode[] = []): UiDocument {
  return {
    schemaVersion: '9.2.0',
    documentId: 'attack',
    name: 'attack',
    initialScreenId: 'list',
    screens: [
      { screenId: 'list', name: 'List', root: screenOf([node('Repeater', 'rows', { source: 'items', item }, [button('row', rowAction)]), button('outside', { type: 'submit' }), ...extra]) },
      { screenId: 'details', name: 'Details', root: screenOf([node('Text', 'name', { content: bound('item.name') }), button('redeem', { type: 'submit' })]) },
    ],
  }
}

interface Seen {
  readonly calls: { readonly action: HotlayoutAction; readonly source: ActionSource }[]
  readonly reports: HotlayoutReport[]
  readonly writes: [string, string | boolean | number][]
  readonly container: HTMLElement
  /**
   * What the reader discards inside an event HANDLER (not during render) is reported to the host
   * with the component's next render. The test requests that render explicitly.
   */
  readonly flush: () => void
}

function show(document: UiDocument, items: unknown, options: { readonly onAction?: (action: HotlayoutAction, source: ActionSource) => void; readonly writablePaths?: readonly string[] } = {}): Seen {
  const seen = { calls: [] as Seen['calls'], reports: [] as HotlayoutReport[], writes: [] as [string, string | boolean | number][] }
  const element = (): ReactElement => (
    <HotlayoutScreen
      document={document}
      collections={{ items } as never}
      writablePaths={options.writablePaths}
      onAction={(action, source) => {
        seen.calls.push({ action, source })
        options.onAction?.(action, source)
      }}
      onWrite={(path, value) => seen.writes.push([path, value])}
      onReport={(report) => seen.reports.push(report)}
    />
  )
  const view = render(element())
  return {
    ...seen,
    container: view.container,
    flush: () => {
      view.rerender(element())
    },
  }
}

const click = (container: HTMLElement, id: string, index = 0): void => {
  const target = container.querySelectorAll(`[data-hl-node="${id}"]`)[index]
  if (target === undefined) throw new Error(`node ${id} is missing`)
  fireEvent.click(target)
}

describe('record keys: own keys only, only the shape of a data path', () => {
  it.each(['__proto__', 'constructor', 'prototype', 'item.__proto__', 'a b', 'x;y', '', '9lives'])('entity prefix "%s" from the document gives the host no key', (item) => {
    const seen = show(documentWith(item), [{ id: 'bottle', name: 'Bottle' }])
    click(seen.container, 'row')
    const record = seen.calls[0]?.source.record
    expect(record).toEqual({})
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype)
    // Discarded input is reported.
    seen.flush()
    expect(seen.reports.some((report) => report.kind === 'ignored-input' && report.where.includes('record'))).toBe(true)
    expect(({} as Record<string, unknown>).id).toBeUndefined()
    expect(({} as Record<string, unknown>).name).toBeUndefined()
  })

  it('an entity prefix that is not a string gives a record without keys and an intact screen', () => {
    for (const item of [null, 42, { evil: true }, ['item']]) {
      const seen = show(documentWith(item), [{ id: 'bottle' }])
      click(seen.container, 'row')
      expect(seen.calls[0]?.source.record).toEqual({})
      cleanup()
    }
  })

  it('an own __proto__ key in a backend record (JSON.parse) neither reaches the host nor touches the prototype', () => {
    const items = JSON.parse('[{"id":"bottle","__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}},"item.__proto__.y":2,"name":"Bottle"}]') as unknown
    const seen = show(documentWith('item'), items)
    click(seen.container, 'row')
    const record = seen.calls[0]?.source.record ?? {}
    expect(Object.keys(record).sort()).toEqual(['item.id', 'item.name'])
    expect((record as Record<string, unknown>).isAdmin).toBeUndefined()
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('inherited fields of a record do not get into it, only own ones', () => {
    const inherited = Object.assign(Object.create({ secret: 'token' }) as Record<string, unknown>, { id: 'bottle' })
    const seen = show(documentWith('item'), [inherited])
    click(seen.container, 'row')
    expect(seen.calls[0]?.source.record).toEqual({ 'item.id': 'bottle' })
  })

  it('a record of the wrong shape (string, null, array, number) does not crash the screen: the row is drawn, the record is empty', () => {
    const seen = show(documentWith('item'), ['text', null, ['a'], 7])
    expect(seen.container.querySelectorAll('[data-hl-node="row"]')).toHaveLength(4)
    for (let index = 0; index < 4; index += 1) click(seen.container, 'row', index)
    expect(seen.calls.map((call) => call.source.record)).toEqual([{}, {}, {}, {}])
    expect(seen.reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })
})

describe('record values belong to the host; the document neither names nor changes them', () => {
  it('a record field added to an action by the document does not reach the host: outside a list there is no record', () => {
    const forged = documentWith('item', { type: 'submit', record: { 'item.id': 'forged' }, source: { record: { 'item.id': 'forged' } }, params: { record: 'forged' } })
    const seen = show({ ...forged, screens: [{ screenId: 'list', name: 'List', root: screenOf([button('outside', { type: 'submit', record: { 'item.id': 'forged' } })]) }] }, [])
    click(seen.container, 'outside')
    expect(seen.calls[0]?.source).toEqual({ nodeId: 'outside', screenId: 'list' })
    expect(seen.calls[0]?.action).toEqual({ type: 'submit' })
  })

  it('values are the same objects the host supplied, not copies from the document', () => {
    const payload = { nested: true }
    const seen = show(documentWith('item'), [{ id: 'bottle', payload }])
    click(seen.container, 'row')
    expect(seen.calls[0]?.source.record?.['item.payload']).toBe(payload)
  })

  it('two collections under one prefix: the document decides WHOSE record is called item, so an id from the event is user input', () => {
    // Not a package hole but a documented boundary: the values are the host's, but which collection is called `item` is up to the document.
    const document = { ...documentWith('item'), screens: [{ screenId: 'list', name: 'List', root: screenOf([node('Repeater', 'rows', { source: 'users', item: 'item' }, [button('row', { type: 'submit' })])]) }] } as unknown as UiDocument
    const calls: ActionSource[] = []
    const view = render(<HotlayoutScreen document={document} collections={{ users: [{ id: 'user-7' }], items: [{ id: 'bottle' }] }} onAction={(_action, source) => calls.push(source)} onReport={() => undefined} />)
    click(view.container, 'row')
    expect(calls[0]?.record).toEqual({ 'item.id': 'user-7' })
  })
})

describe('the record is frozen: a host handler cannot change what the next screen sees', () => {
  it('an attempt to write into source.record throws in strict mode and changes nothing', () => {
    const seen = show(documentWith('item'), [{ id: 'bottle', name: 'Bottle' }])
    click(seen.container, 'row')
    const record = seen.calls[0]?.source.record as Record<string, unknown>
    expect(Object.isFrozen(record)).toBe(true)
    expect(() => {
      record['item.name'] = 'Forged'
    }).toThrow(TypeError)
    expect(record['item.name']).toBe('Bottle')
  })

  it('an onNavigate handler that tampers with the record does not corrupt the details screen', () => {
    const document = documentWith('item', { type: 'navigate', params: { screenId: 'details' } })
    const view = render(
      <HotlayoutScreen
        document={document}
        collections={{ items: [{ id: 'bottle', name: 'Bottle' }] }}
        data={{ 'item.name': 'FROM DATA' }}
        onNavigate={(event) => {
          try {
            ;(event.source.record as Record<string, unknown>)['item.name'] = 'Forged'
          } catch {
            // Frozen, as it should be.
          }
          return undefined
        }}
        onReport={() => undefined}
      />,
    )
    click(view.container, 'row')
    expect(view.container.querySelector('[data-hl-node="name"]')?.textContent).toBe('Bottle')
  })
})

describe('the record does not open a route to data writes', () => {
  it('a navigation with a record and an action with a record never call onWrite', () => {
    const document = documentWith('item', { type: 'navigate', params: { screenId: 'details' } })
    const seen = show(document, [{ id: 'bottle', name: 'Bottle', selectedId: 'bottle' }], { writablePaths: [] })
    click(seen.container, 'row')
    click(seen.container, 'redeem')
    expect(seen.calls[0]?.source.record).toMatchObject({ 'item.id': 'bottle' })
    expect(seen.writes).toEqual([])
  })

  it('a choice group in a list row writes only to an allowed path; the row record does not widen that', () => {
    const group = node('ChoiceGroup', 'pick', { value: bound('item.secret', '') }, [
      node('ListTile', 'option', { leading: { kind: 'none' }, title: lit('option'), subtitle: lit(''), trailing: { kind: 'radio', optionValue: 'x' } }),
    ])
    const document = { ...documentWith('item'), screens: [{ screenId: 'list', name: 'List', root: screenOf([node('Repeater', 'rows', { source: 'items', item: 'item' }, [group])]) }] } as unknown as UiDocument
    // The record carries `item.secret`, but it is not in `writablePaths`.
    const seen = show(document, [{ id: 'bottle', secret: 's' }], { writablePaths: ['item.selectedId'] })
    const radio = seen.container.querySelector('[role="radio"]')
    if (radio === null) throw new Error('no radio')
    fireEvent.click(radio)
    expect(seen.writes).toEqual([])
    seen.flush()
    expect(seen.reports.some((report) => report.kind === 'ignored-input' && report.where === 'onWrite path')).toBe(true)
  })
})

describe('record and stack', () => {
  it('the host cancelled the navigation, so the record went nowhere: a next screen opened another way does not see it', () => {
    const document = { ...documentWith('item', { type: 'navigate', params: { screenId: 'details' } }) }
    let cancel = true
    const view = render(
      <HotlayoutScreen
        document={document}
        collections={{ items: [{ id: 'bottle', name: 'Bottle' }] }}
        onNavigate={() => (cancel ? false : undefined)}
        onAction={() => undefined}
        onReport={() => undefined}
      />,
    )
    click(view.container, 'row')
    expect(view.container.querySelector('[data-hl-screen]')?.getAttribute('data-hl-screen')).toBe('list')
    cancel = false
    // No "outside" button navigates in this document, so open details through an entry point: there is no record.
    view.rerender(<HotlayoutScreen document={{ ...document, entryPoints: { d: 'details' } }} entry="d" collections={{ items: [{ id: 'bottle', name: 'Bottle' }] }} onReport={() => undefined} />)
    expect(view.container.querySelector('[data-hl-node="name"]')?.textContent).toBe('FALLBACK')
  })

  it('a new version of the same document mid-flow keeps the frame and its record', () => {
    const document = documentWith('item', { type: 'navigate', params: { screenId: 'details' } })
    const props = { collections: { items: [{ id: 'bottle', name: 'Bottle' }] }, onReport: () => undefined }
    const view = render(<HotlayoutScreen document={document} {...props} />)
    click(view.container, 'row')
    view.rerender(<HotlayoutScreen document={JSON.parse(JSON.stringify(document)) as UiDocument} {...props} />)
    expect(view.container.querySelector('[data-hl-node="name"]')?.textContent).toBe('Bottle')
  })
})
