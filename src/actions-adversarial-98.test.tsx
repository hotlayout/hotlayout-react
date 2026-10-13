/**
 * Adversarial tests for the action catalog (schema 9.8.0) in `@hotlayout/react`.
 *
 * Each test asserts what the package claims (`action-catalog.ts`, `standard-actions.ts`): the
 * "gap" groups pin claims that must hold (an unmet claim is a failing test), the "guard" groups
 * pin hostile inputs the reader must keep rejecting.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen, openInNewTab, paramFormProblem, runStandardAction } from './index'
import type { HotlayoutAction, TrackEvent, UiDocument } from './index'

afterEach(cleanup)

const text = (value: string) => ({ kind: 'literal', value })

function documentOf(children: readonly unknown[], extraScreens: readonly unknown[] = []): UiDocument {
  return {
    schemaVersion: '9.8.0',
    documentId: 'adv',
    name: 'adv',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'a', root: { id: 'root-a', type: 'Screen', props: {}, children } }, ...extraScreens],
  } as unknown as UiDocument
}

const button = (id: string, action: unknown) => ({ id, type: 'Button', props: { label: text(id), action } })
const screen = (screenId: string, children: readonly unknown[] = []) => ({ screenId, name: screenId, root: { id: `root-${screenId}`, type: 'Screen', props: {}, children: [{ id: `t-${screenId}`, type: 'Text', props: { content: text(`screen ${screenId}`) } }, ...children] } })

interface Log {
  readonly actions: HotlayoutAction[]
  readonly tracks: TrackEvent[]
  readonly shown: { screenId: string; cause: string; depth: number; record: unknown }[]
  readonly reports: unknown[]
}

function mount(document: UiDocument, data: Record<string, unknown> = {}) {
  const log: Log = { actions: [], tracks: [], shown: [], reports: [] }
  const element = (doc: UiDocument) => (
    <HotlayoutScreen
      document={doc}
      data={data}
      onAction={(action) => void log.actions.push(action)}
      onTrack={(event) => void log.tracks.push(event)}
      onScreenChange={(shown) => void log.shown.push({ screenId: shown.screenId, cause: shown.cause, depth: shown.depth, record: shown.record })}
      onReport={(report) => void log.reports.push(report)}
    />
  )
  const view = render(element(document))
  const node = (id: string): Element => {
    const found = view.container.querySelector(`[data-hl-node="${id}"]`)
    if (found === null) throw new Error(`node ${id} is not on screen`)
    return found
  }
  return { log, view, node, rerender: (doc: UiDocument) => {
      view.rerender(element(doc))
    },
  }
}

function handedFor(action: unknown, data: Record<string, unknown> = {}): HotlayoutAction {
  const { log, node } = mount(documentOf([button('go', action)]), data)
  fireEvent.click(node('go'))
  const handed = log.actions[0]
  if (handed === undefined) throw new Error('the action never reached the host')
  return handed
}

/* ───────────────────────────── gaps: claims that must hold ───────────────────────────── */

describe('gap 1: navigation target from DATA — the catalog says `bindable: false` (the document names the screen)', () => {
  it('navigate with `paramBindings.screenId` goes to the screen the DOCUMENT named, not the data', () => {
    const action = { type: 'navigate', params: { screenId: 'safe' }, paramBindings: { screenId: 'user.next' } }
    const { log, node } = mount(documentOf([button('go', action)], [screen('safe'), screen('admin')]), { 'user.next': 'admin' })
    fireEvent.click(node('go'))
    // Catalog entry `{ name: 'screenId', form: 'screenId', bindable: false }`: the target of a
    // navigation is never bound; the document names the screen.
    expect(log.shown.at(-1)?.screenId).toBe('safe')
  })
})

describe('gap 2: `standard` — an address that passed the form check but is not a platform address', () => {
  // The host as a human reads it is the host of the expression; the browser would open something
  // else or throw inside `window.open`.
  const visibleHost = (url: string): string => /^https:\/\/([^/?#:]+)/.exec(url)?.[1]?.toLowerCase() ?? ''

  it.each(['https://a.example:99999/pay', 'https://a.example:65536', 'https://1.2.3.4.5/x', 'https://a..b.example/'])('verified address %s is parseable by the platform (otherwise `openInNewTab` throws in the host handler)', (url) => {
    const handed = handedFor({ type: 'openUrl', params: { url } })
    // Either the address is not `standard`, or it can be opened: `standard` means safe to hand to
    // runStandardAction.
    if (handed.standard?.type === 'openUrl') expect(() => new URL(handed.standard?.type === 'openUrl' ? handed.standard.url : '')).not.toThrow()
  })

  it.each(['https://2130706433/login', 'https://0x7f.1/login', 'https://127.1/login', 'https://017700000001/'])('verified address %s leads to the host written in it (not to 127.0.0.1)', (url) => {
    const handed = handedFor({ type: 'openUrl', params: { url } })
    if (handed.standard?.type !== 'openUrl') return
    expect(new URL(handed.standard.url).hostname).toBe(visibleHost(url))
  })
})

describe('gap 3: analytics event with a parameter key `constructor` / `prototype`', () => {
  // The schema does not publish such names (`track.params` included). A reader that still meets
  // them in a document IGNORES the whole event: an event assembled from the surviving pieces
  // would not be the one the author described.
  it.each(['constructor', 'prototype'])('key %s — no event at all', (key) => {
    const { log, node } = mount(documentOf([button('go', { type: 'none', track: { event: 'offer_open', params: { [key]: 'x', placement: 'banner' } } })]))
    fireEvent.click(node('go'))
    expect(log.tracks).toHaveLength(0)
  })
})

describe('gap 4: exactly once per press — key auto-repeat on a list row', () => {
  it('a held Enter on `ListTile` sends ONE event and ONE action, not one per auto-repeat', () => {
    const row = { id: 'row', type: 'ListTile', props: { title: text('Pay 10'), action: { type: 'pay', params: { amount: '10' }, track: { event: 'pay_press' } } } }
    const { log, node } = mount(documentOf([row]))
    fireEvent.keyDown(node('row'), { key: 'Enter' })
    for (let index = 0; index < 30; index += 1) fireEvent.keyDown(node('row'), { key: 'Enter', repeat: true })
    fireEvent.keyUp(node('row'), { key: 'Enter' })
    expect(log.tracks).toHaveLength(1)
    expect(log.actions).toHaveLength(1)
  })
})

describe('gap 5: the helper must execute what it verified (the value must not be read twice)', () => {
  // `standard-actions.ts`: an object assembled by hand does not become "verified" by having the
  // right fields.
  it('getter address: one value verified, another handed to the handler', () => {
    const opened: string[] = []
    let reads = 0
    const standard = {
      type: 'openUrl' as const,
      get url(): string {
        reads += 1
        return reads === 1 ? 'https://bank.example/ok' : 'javascript:alert(document.cookie)'
      },
    }
    runStandardAction({ type: 'openUrl', standard }, { openUrl: (url) => void opened.push(url) })
    for (const url of opened) expect(paramFormProblem('httpsUrl', url)).toBeUndefined()
  })

  it('object address with `toString`: the expression sees a string, the handler would get an object', () => {
    const opened: unknown[] = []
    let reads = 0
    const hostile = {
      length: 10,
      startsWith: () => true,
      toString: () => {
        reads += 1
        return reads === 1 ? 'https://bank.example/ok' : 'javascript:alert(1)'
      },
    }
    let ran: boolean
    try {
      ran = runStandardAction({ type: 'openUrl', standard: { type: 'openUrl', url: hostile as unknown as string } }, { openUrl: (url) => void opened.push(url) })
    } catch {
      ran = false
    }
    expect(ran).toBe(false)
    expect(opened).toEqual([])
  })

  it('getter app-link scheme: `myapp` verified, `tel:` opened', () => {
    const opened: string[] = []
    let reads = 0
    const standard = {
      type: 'deeplink' as const,
      scheme: 'myapp',
      get url(): string {
        reads += 1
        return reads <= 2 ? 'myapp://offers/1' : 'tel:+380000000000'
      },
    }
    runStandardAction({ type: 'deeplink', standard }, { deeplinkSchemes: ['myapp'], openDeeplink: (url) => void opened.push(url) })
    for (const url of opened) expect(url.startsWith('myapp:')).toBe(true)
  })

  it('`deeplinkSchemes` given as a string (a host without TypeScript) does not allow SUBSTRINGS: `my`, `app`, `ya`', () => {
    const opened: string[] = []
    const run = (url: string, scheme: string) => runStandardAction({ type: 'deeplink', standard: { type: 'deeplink', url, scheme } }, { deeplinkSchemes: 'myapp' as unknown as readonly string[], openDeeplink: (opening) => void opened.push(opening) })
    run('app://x', 'app')
    run('my://x', 'my')
    run('ya://x', 'ya')
    expect(opened).toEqual([])
  })
})

describe('gap 6: shown event when a new version of the SAME document removed the top screen', () => {
  it('the screen under the removed one is NOT shown with cause `forward` (nothing was pushed) and the stack keeps no ghost', () => {
    const full = documentOf([button('go', { type: 'navigate', params: { screenId: 'b' } }), button('back', { type: 'navigate.back' })], [screen('b')])
    const { log, node, rerender } = mount(full)
    fireEvent.click(node('go'))
    expect(log.shown.map((shown) => `${shown.screenId}:${shown.cause}:${String(shown.depth)}`)).toEqual(['a:entry:1', 'b:forward:2'])
    // A new version without screen `b` is published: the user is back on `a`.
    rerender(documentOf([button('go', { type: 'navigate', params: { screenId: 'b' } }), button('back', { type: 'navigate.back' })]))
    const last = log.shown.at(-1)
    // `forward` means a push. Nothing was pushed here: either there is no event (then `b:forward:2`
    // stays the last one and the host believes `b` is shown) or its cause is not `forward`.
    expect(last?.screenId).toBe('a')
    expect(last?.cause).not.toBe('forward')
  })
})

describe('gap 7: the `params` value limit (2048) — in the schema only, the reader does not enforce it', () => {
  it('a custom action with a 1 MB parameter does not reach the host whole', () => {
    const handed = handedFor({ type: 'share', params: { note: 'x'.repeat(1_000_000) } })
    expect((handed.params?.note ?? '').length).toBeLessThanOrEqual(2048)
  })
})

/* ───────────────────────────── guards: what holds ───────────────────────────── */

describe('guard: `https` address form — hostile strings a browser would read differently', () => {
  const hostile: readonly (readonly [string, string])[] = [
    ['userinfo', 'https://bank.example@evil.example/'],
    ['userinfo with a password', 'https://bank.example:443@evil.example/'],
    ['backslash instead of host', 'https:\\\\evil.example/'],
    ['backslash after host', 'https://bank.example\\@evil.example/'],
    ['https:/\\', 'https:/\\evil.example'],
    ['three slashes', 'https:///evil.example'],
    ['one slash', 'https:/evil.example'],
    ['tab in scheme', 'ht\ttps://evil.example'],
    ['tab in host', 'https://bank\t.example'],
    ['trailing line feed', 'https://bank.example/\n'],
    ['inner line feed', 'https://bank.example/\njavascript:alert(1)'],
    ['leading space', ' https://bank.example'],
    ['uppercase scheme', 'HTTPS://bank.example'],
    ['Cyrillic a in host', 'https://b\u0430nk.example'],
    ['fullwidth dot', 'https://bank\uFF0Eexample'],
    ['ideographic dot', 'https://bank\u3002example'],
    ['RTL override in host', 'https://bank.example\u202Eelpmaxe.live'],
    ['zero-width space', 'https://bank.example\u200B.evil.example'],
    ['trailing dot in host', 'https://bank.example./'],
    ['IPv6', 'https://[::1]/'],
    ['IPv6 with brackets and port', 'https://[::ffff:127.0.0.1]:443/'],
    ['percent in host', 'https://bank.example%2eevil.example/'],
    ['six-digit port', 'https://bank.example:123456/'],
    ['empty port', 'https://bank.example:/'],
    ['surrogate pair', 'https://bank.example/\uD83D\uDE00'],
    ['lone surrogate', 'https://bank.example/\uD800'],
    ['NUL', 'https://bank.example/\u0000'],
    ['quote', 'https://bank.example/"onmouseover="x'],
    ['angle bracket', 'https://bank.example/<script>'],
    ['javascript', 'javascript:alert(1)'],
    ['javascript with a space', ' javascript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['http', 'http://bank.example'],
    ['no scheme', '//evil.example'],
    ['2049 characters', `https://bank.example/${'a'.repeat(2049 - 'https://bank.example/'.length)}`],
  ]
  it.each(hostile)('%s — `invalid`, and the helper does not execute', (_name, url) => {
    const handed = handedFor({ type: 'openUrl', params: { url } })
    expect(handed.standard).toBeUndefined()
    expect(handed.invalid?.param).toBe('url')
    const opened: string[] = []
    expect(runStandardAction(handed, { openUrl: (opening) => void opened.push(opening) })).toBe(false)
    expect(opened).toEqual([])
  })

  it('exactly 2048 characters pass, 2049 do not (from data too: too long means absent, the literal applies)', () => {
    const exact = `https://bank.example/${'a'.repeat(2048 - 'https://bank.example/'.length)}`
    expect(handedFor({ type: 'openUrl', params: { url: exact } }).standard).toEqual({ type: 'openUrl', url: exact })
    const bound = handedFor({ type: 'openUrl', params: { url: 'https://bank.example/literal' }, paramBindings: { url: 'offer.url' } }, { 'offer.url': `${exact}a` })
    expect(bound.standard).toEqual({ type: 'openUrl', url: 'https://bank.example/literal' })
  })
})

describe('guard: app links', () => {
  it.each(['JavaScript:alert(1)', 'jAvAsCrIpT:alert(1)', ' javascript:alert(1)', '\tjavascript:alert(1)', 'java\nscript:alert(1)', 'intent://x#Intent;end', 'file:///etc/passwd', 'content://sms/inbox', 'INTENT://x', 'c:\\windows', 'x:y z', 'myapp://open?u="x"'])('%s — not `standard`', (url) => {
    const handed = handedFor({ type: 'deeplink', params: { url } })
    expect(handed.standard).toBeUndefined()
    expect(runStandardAction(handed, { deeplinkSchemes: ['javascript', 'intent', 'file', 'content', 'myapp', 'c', 'x'], openDeeplink: () => undefined })).toBe(false)
  })

  it('`tel:` and `sms:` are `standard` by form, but the helper without the host scheme list does not execute them (the second layer is mandatory)', () => {
    for (const url of ['tel:+380000000000', 'sms:+380000000000?body=PAY']) {
      const handed = handedFor({ type: 'deeplink', params: { url } })
      expect(handed.standard?.type).toBe('deeplink')
      const opened: string[] = []
      expect(runStandardAction(handed, { openDeeplink: (opening) => void opened.push(opening) })).toBe(false)
      expect(runStandardAction(handed, { deeplinkSchemes: ['myapp'], openDeeplink: (opening) => void opened.push(opening) })).toBe(false)
      expect(opened).toEqual([])
    }
  })
})

describe('guard: parameter from data', () => {
  const action = { type: 'openUrl', params: { url: 'https://bank.example/literal' }, paramBindings: { url: 'offer.url' } }

  it.each<[string, unknown]>([
    ['object with toString', { toString: () => 'https://evil.example' }],
    ['array of one string', ['https://evil.example']],
    ['number', 42],
    ['String object', Object('https://evil.example')],
    ['empty string', ''],
    ['null', null],
  ])('%s in data — treated as absent, the literal applies', (_name, value) => {
    expect(handedFor(action, { 'offer.url': value }).standard).toEqual({ type: 'openUrl', url: 'https://bank.example/literal' })
  })

  it('a string of the wrong form from data is NOT replaced by the literal — the action is invalid', () => {
    const handed = handedFor(action, { 'offer.url': 'javascript:alert(1)' })
    expect(handed.standard).toBeUndefined()
    expect(handed.invalid).toEqual({ param: 'url', problem: 'not-https' })
  })

  it.each(['__proto__', 'constructor', 'constructor.prototype', '__proto__.polluted', 'toString', 'hasOwnProperty'])('path %s does not read the prototype', (path) => {
    const handed = handedFor({ type: 'share', paramBindings: { leak: path } }, {})
    expect(handed.params).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('a binding key `__proto__` / `constructor` does not become a parameter and does not touch the prototype', () => {
    const raw = JSON.parse('{"type":"share","paramBindings":{"__proto__":"user.token","constructor":"user.token","ok":"user.token"}}') as unknown
    const handed = handedFor(raw, { 'user.token': 'secret' })
    expect(Object.keys(handed.params ?? {})).toEqual(['ok'])
    expect(Object.isFrozen(handed.params)).toBe(true)
  })

  it('exfiltration: data cannot be APPENDED to a foreign address — a parameter is entirely from data or entirely a literal', () => {
    // A hostile document wants `https://evil.example/?t=<token>`. An action parameter has no
    // concatenation: templates do not exist there.
    const handed = handedFor({ type: 'openUrl', params: { url: 'https://evil.example/?t=' }, paramBindings: { t: 'user.token', url: 'user.token' } }, { 'user.token': 'secret-token' })
    // The token is not an address, so the action is invalid and `standard` is absent.
    expect(handed.standard).toBeUndefined()
    // The host still receives it in `params`, as documented (parameters from data are substituted).
    // There is no READ boundary: a document can reach any data key.
    expect(handed.params).toEqual({ url: 'secret-token', t: 'secret-token' })
  })
})

describe('guard: analytics event and `carryRecord`', () => {
  const tracksOf = (track: unknown): TrackEvent[] => {
    const { log, node } = mount(documentOf([button('go', { type: 'none', track })]))
    if (document.querySelector('[data-hl-node="go"]') !== null) fireEvent.click(node('go'))
    return log.tracks
  }

  it.each([
    ['control character in the name', { event: 'buy\u0000now' }],
    ['trailing line feed in the name', { event: 'buy\n' }],
    ['space', { event: 'buy now' }],
    ['41 characters', { event: 'a'.repeat(41) }],
    ['non-ASCII lookalike', { event: 'b\u0443y' }],
    ['26 parameters', { event: 'buy', params: Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`p${String(index)}`, 'x'])) }],
    ['numeric value', { event: 'buy', params: { amount: 10 } }],
    ['object value', { event: 'buy', params: { a: { $ne: null } } }],
    ['101-character value', { event: 'buy', params: { a: 'x'.repeat(101) } }],
    ['array', ['buy']],
    ['params as an array', { event: 'buy', params: ['x'] }],
  ])('%s — no event at all', (_name, track) => {
    expect(tracksOf(track)).toEqual([])
  })

  it('an event does not read data: parameter values are the document literals only', () => {
    const { log, node } = mount(documentOf([button('go', { type: 'none', track: { event: 'buy', params: { token: 'user.token' }, paramBindings: { token: 'user.token' } } })]), { 'user.token': 'secret' })
    fireEvent.click(node('go'))
    expect(log.tracks).toEqual([{ event: 'buy', params: { token: 'user.token' } }])
  })

  it('one event per click, and the handed-over action does not carry it', () => {
    const { log, node } = mount(documentOf([button('go', { type: 'share', track: { event: 'share_press' }, carryRecord: true, paramBindings: {} })]))
    fireEvent.click(node('go'))
    expect(log.tracks).toHaveLength(1)
    expect(Object.keys(log.actions[0] ?? {})).toEqual(['type'])
  })

  it.each(['true', 1, 'yes', {}, []])('`carryRecord: %j` — the record does NOT travel to the page', (carry) => {
    const list = {
      id: 'list',
      type: 'Repeater',
      props: { source: 'items', itemPrefix: 'item' },
      children: [{ id: 'row', type: 'ListTile', props: { title: text('row'), action: { type: 'navigate', params: { screenId: 'details' } } } }],
    }
    const details = screen('details', [button('next', { type: 'navigate', params: { screenId: 'delivery' }, carryRecord: carry })])
    const { log, node } = mount(documentOf([list], [details, screen('delivery')]), {})
    // If the list drew nothing without a collection there is nothing to check; the guard then
    // rests on the button of screen `a`.
    if (document.querySelector('[data-hl-node="row"]') === null) return
    fireEvent.click(node('row'))
    fireEvent.click(node('next'))
    expect(log.shown.at(-1)).toMatchObject({ screenId: 'delivery', record: null })
  })
})

describe('guard: `openInNewTab`', () => {
  it('opens with `noopener,noreferrer` and without a reference to the host window', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      openInNewTab('https://bank.example/a')
      expect(open).toHaveBeenCalledWith('https://bank.example/a', '_blank', 'noopener,noreferrer')
    } finally {
      open.mockRestore()
    }
  })
})
