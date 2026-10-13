/**
 * Adversarial tests for the boundaries between a document and the host.
 *
 * A document names STRINGS that the package hands to the host or uses to index its own tables: a
 * write path (`onWrite`), action parameters, a condition path, a format name, an image address.
 * Every such string comes from the network, and each test asserts the safe behaviour.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isConditionMet } from './conditions'
import { formatBound } from './data'
import { HOTLAYOUT_CSS, HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutAction, UiDocument } from './index'
import type { VisibilityCondition } from './types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const lit = (value: string): unknown => ({ kind: 'literal', value })

function documentWith(children: readonly unknown[]): UiDocument {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: READER_SCHEMA_VERSION,
      documentId: 'doc',
      name: 'Doc',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children } }],
    }),
  ) as UiDocument
}

describe('onWrite: the document chooses the path', () => {
  const group = (path: string): unknown => ({
    id: 'group',
    type: 'ChoiceGroup',
    props: { value: { kind: 'binding', path, fallback: '' } },
    children: [{ id: 'opt', type: 'ListTile', props: { title: lit('Accept'), leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: 'yes' } } }],
  })

  /*
   * A host with nested state writes values "by path" (`lodash.set(state, path, value)`, its own
   * `setIn`): a path such as `__proto__.x` or `constructor.prototype.x` pollutes `Object.prototype`
   * in the host app. The package strips `__proto__` from ACTION params (`withoutForbiddenKeys`);
   * the write path must be stopped as well.
   */
  it.each(['__proto__.isAdmin', 'constructor.prototype.isAdmin', '__proto__'])('path "%s" never reaches the host', (path) => {
    const onWrite = vi.fn()
    render(<HotlayoutScreen document={documentWith([group(path)])} onWrite={onWrite} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('radio'))
    expect(onWrite).not.toHaveBeenCalled()
  })
})

describe('action params: `constructor.prototype` is the same route to the prototype as `__proto__`', () => {
  it('a nested `constructor` in params never reaches the host (the schema allows strings only)', () => {
    const received: HotlayoutAction[] = []
    const document = documentWith([
      { id: 'b', type: 'Button', props: { label: lit('go'), variant: 'primary', action: { type: 'open', params: { id: '7', constructor: { prototype: { isAdmin: true } } } } } },
    ])
    render(<HotlayoutScreen document={document} onAction={(action) => received.push(action)} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    const params = received[0]?.params as Readonly<Record<string, unknown>> | undefined
    expect(params === undefined || !Object.hasOwn(params, 'constructor')).toBe(true)
  })

  it('a parameter value is a string, as the schema says (`additionalProperties: string`), not an object', () => {
    const received: HotlayoutAction[] = []
    const document = documentWith([{ id: 'b', type: 'Button', props: { label: lit('go'), variant: 'primary', action: { type: 'open', params: { id: { $ne: null } } } } }])
    render(<HotlayoutScreen document={document} onAction={(action) => received.push(action)} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    // `{ $ne: null }` in a parameter that the host puts into a query to its backend is a classic NoSQL injection.
    expect(typeof (received[0]?.params as Readonly<Record<string, unknown>> | undefined)?.id).not.toBe('object')
  })
})

describe('a data path is an own key, not a prototype chain lookup', () => {
  const condition = (path: string, op: string): VisibilityCondition => ({ path, op }) as VisibilityCondition

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('a condition on "%s" sees an ABSENT value (`missingConditionValue: absent-is-empty`)', (path) => {
    expect(isConditionMet(condition(path, 'isEmpty'), {})).toBe(true)
    expect(isConditionMet(condition(path, 'isNotEmpty'), {})).toBe(false)
  })
})

describe('binding format: an unknown name means "show as is" (`unknownBindingFormat: render-as-is`)', () => {
  it.each(['constructor', 'toString', '__proto__', 'valueOf'])('format "%s" does not find "settings" on the table prototype', (format) => {
    expect(formatBound('2026-10-31T23:59:59.000Z', format, 'en', 'UTC')).toBeUndefined()
  })
})

describe('image address: https only — a rule the schema artifact does not state', () => {
  /*
   * The authoring side accepts only `https:`, but in the schema artifact `url` is an arbitrary
   * string. A reader that put anything into `<img src>` and `background-image` would issue
   * `http:` requests (cleartext from the host page), or follow `data:`, `blob:`, `file:`.
   */
  it.each(['http://attacker.test/pixel.gif', 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', 'javascript:alert(1)'])('Image: "%s" does not become src', (url) => {
    render(<HotlayoutScreen document={documentWith([{ id: 'img', type: 'Image', props: { source: { kind: 'url', url }, aspectRatio: '1:1', alt: 'x' } }])} onReport={() => undefined} />)
    expect(document.querySelector('img')?.getAttribute('src') ?? null).not.toBe(url)
  })
})

describe('the package stylesheet does not touch HOST elements', () => {
  /*
   * A selector such as `:is([data-hotlayout], #hotlayout) *` for specificity would rely on no
   * element having that id. A host page can: `<div id="hotlayout">` is the most natural name for a
   * mount point, and then EVERY descendant of it, including what the host drew next to the screen,
   * would get `all: unset`.
   */
  it('a descendant of a host `#hotlayout` outside the screen root is not matched by the package rules', () => {
    document.body.innerHTML = '<main id="hotlayout"><nav><a id="bank-link" href="/logout">Log out</a></nav><div id="mount"></div></main>'
    const link = document.getElementById('bank-link')
    // The first rule of the stylesheet is the reset: three selectors separated by commas, the first without a pseudo-element.
    const reset = HOTLAYOUT_CSS.split('\n')[0] ?? ''
    const selector = reset.slice(0, reset.indexOf(' *,') + 2)
    const matched = link?.matches(selector) === true ? [selector] : []
    document.body.innerHTML = ''
    expect(matched).toEqual([])
  })
})

describe('the package root keeps its content inside', () => {
  /*
   * Without clipping, a document alone (no server, no theme) can take over the host page. In a
   * browser, with a 360px host card and the host's own buttons around the root:
   *  - a button with `style.width: 1200` in a row overflows the card on the right, so
   *    `elementFromPoint` at the centre of the host's "Transfer" button returns a document node
   *    and a real mouse click goes to `onAction`, not to the host;
   *  - a 1px-high button at the top of the screen has a press area (`hl-press::after`, 48px,
   *    out of flow) that protrudes 23px ABOVE the root and steals the click of an adjacent host
   *    button;
   *  - a shadow (see `css-injection-adversarial`) paints the whole page.
   * jsdom computes no layout, so this asserts the structural condition: the root clips whatever
   * is drawn outside its box.
   */
  it('the root declares clipping (overflow: hidden | clip or contain: paint)', () => {
    const { container } = render(<HotlayoutScreen document={documentWith([{ id: 't', type: 'Text', props: { content: lit('x') } }])} onReport={() => undefined} />)
    const style = container.querySelector('[data-hotlayout]')?.getAttribute('style') ?? ''
    expect(style).toMatch(/overflow(?:-[xy])?\s*:\s*(?:hidden|clip)|contain\s*:\s*[^;]*paint/)
  })
})
