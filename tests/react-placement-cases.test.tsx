/**
 * PLACEMENTS THROUGH THE PACKAGE `@hotlayout/react`: the shared table
 * `contract/fixtures/placements/placement-cases.json` (`readCases`, `sourceCases`, `showingCases`, `scheduleCases`),
 * every row, plus the component and the hook on a fake network.
 *
 * The package does not import the builder's `src/`, so the rule is written a second time
 * (`placements.ts`); the table is what keeps the copies together. The table is read as raw JSON:
 * `__proto__` in it must stay an OWN key, as it is in a file that came from the network.
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HotlayoutPlacement,
  isPlacementName,
  loadPlacementMap,
  pickPlacementMap,
  PLACEMENT_REQUEST_DEADLINE_MS,
  placementEvent,
  PLACEMENTS_READ_MAX_BYTES,
  PLACEMENTS_READ_MAX_DEPTH,
  nextPlacementBoundary,
  readPlacementMapBytes,
  placementShowing,
  readPlacementMap,
  readPlacementMapText,
  READER_PLACEMENTS_VERSION,
  resolvePlacement,
  resolvePlacementAt,
  usePlacement,
} from '../src/index'
import { computePlacement } from '../src/placement-state'
import type {
  PlacementDocumentOutcome,
  PlacementEvent,
  PlacementMapStore,
  PlacementSettled,
  PlacementNetworkOutcome,
  PlacementReport,
  PlacementResolution,
  PlacementState,
  PlacementStatusEvent,
  UiDocument,
} from '../src/index'

afterEach(cleanup)

interface Resolve {
  readonly name: string
  readonly status: string
  readonly documentId: string | null
  readonly entry: string | null
}
interface ReadCase {
  readonly name: string
  readonly json?: unknown
  readonly text?: string
  readonly read: 'map' | 'corrupt' | 'unsupported'
  readonly resolve: readonly Resolve[]
}
interface SourceCase {
  readonly name: string
  readonly network: PlacementNetworkOutcome
  readonly lastKnown?: string
  readonly bundled?: string
  readonly expected: { readonly source: string; readonly status: string; readonly remember: boolean }
  readonly resolve: readonly Resolve[]
}
interface ShowingCase {
  readonly name: string
  readonly resolution: PlacementResolution
  readonly document?: PlacementDocumentOutcome
  readonly expected: { readonly show: string; readonly entry: string | null; readonly report: PlacementReport | null }
}

/** A part of a body: text (encoded as UTF-8) or raw bytes in hex, `times` times. */
interface BodyPart {
  readonly text?: string
  readonly hex?: string
  readonly times?: number
}
interface BodyCase {
  readonly name: string
  readonly body: readonly BodyPart[]
  readonly read: 'map' | 'corrupt' | 'unsupported'
  readonly resolve: readonly Resolve[]
}
interface Answer {
  readonly status: number
  readonly headersAtMs?: number
  readonly completedAtMs: number | null
  readonly body?: readonly BodyPart[]
}
interface TransportCase {
  readonly name: string
  readonly request: 'map' | 'document'
  readonly answer: Answer
  readonly expected: string
}
interface ScheduleCheck {
  readonly place: string
  readonly now: string
  readonly status: string
  readonly documentId: string | null
  readonly entry: string | null
  readonly next: string | null
}
interface ScheduleCase {
  readonly name: string
  readonly json?: unknown
  readonly text?: string
  readonly checks: readonly ScheduleCheck[]
}
interface EventCase {
  readonly name: string
  readonly states: readonly PlacementSettled[]
  readonly events: readonly PlacementEvent[]
}
interface CacheStep {
  readonly project: 'a' | 'b'
  readonly map: PlacementNetworkOutcome
  readonly document?: 'ok' | 'notFound' | 'offline'
  readonly expected: { readonly status: string; readonly report: string | null; readonly mapStatus: string }
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/placements/placement-cases.json', 'utf8')) as {
  readonly readCases: readonly ReadCase[]
  readonly sourceCases: readonly SourceCase[]
  readonly showingCases: readonly ShowingCase[]
  readonly bodyCases: readonly BodyCase[]
  readonly transportCases: readonly TransportCase[]
  readonly eventCases: readonly EventCase[]
  readonly cacheCases: readonly { readonly name: string; readonly steps: readonly CacheStep[] }[]
  readonly scheduleCases: readonly ScheduleCase[]
}

function bytesOf(parts: readonly BodyPart[]): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    const one = part.hex === undefined ? [...new TextEncoder().encode(part.text ?? '')] : (part.hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16))
    for (let index = 0; index < (part.times ?? 1); index += 1) for (const byte of one) out.push(byte)
  }
  return Uint8Array.from(out)
}
const ARTIFACT = JSON.parse(readFileSync('contract/placements.json', 'utf8')) as Record<string, unknown> & {
  readonly 'x-limits': { readonly name: { pattern: string; maxLength: number }; readonly documentId: { pattern: string }; readonly entry: { pattern: string; maxLength: number } }
}
const SHOWCASE = JSON.parse(readFileSync('contract/fixtures/rewards-showcase-screens.json', 'utf8')) as UiDocument

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)

function expectResolutions(map: ReturnType<typeof readPlacementMap>, rows: readonly Resolve[]): void {
  for (const row of rows) {
    expect(resolvePlacement(map, row.name), `name ${JSON.stringify(row.name)}`).toEqual({ status: row.status, documentId: row.documentId, entry: row.entry })
  }
}

describe('placement map: readCases', () => {
  it('the table is what the shared contract documents', () => {
    expect(TABLE.readCases.length).toBe(36)
    expect(TABLE.sourceCases.length).toBe(21)
    expect(TABLE.showingCases.length).toBe(10)
  })

  it.each(named(TABLE.readCases))('%s', (_name, row) => {
    const read = row.text !== undefined ? readPlacementMapText(row.text) : readPlacementMap(row.json)
    expect(read.kind).toBe(row.read)
    expectResolutions(read, row.resolve)
    // The same file as text, the way it arrives from the network.
    if (row.text === undefined) {
      const fromText = readPlacementMapText(JSON.stringify(row.json))
      expect(fromText.kind).toBe(row.read)
      expectResolutions(fromText, row.resolve)
    }
  })
})

describe('placement map: sourceCases', () => {
  it.each(named(TABLE.sourceCases))('%s', (_name, row) => {
    const decision = pickPlacementMap({ network: row.network, lastKnown: row.lastKnown, bundled: row.bundled })
    expect({ source: decision.source, status: decision.status, remember: decision.remember }).toEqual(row.expected)
    expectResolutions(decision.map, row.resolve)
  })
})

describe('placement map: bodyCases', () => {
  it.each(named(TABLE.bodyCases))('%s', async (_name, row) => {
    const bytes = bytesOf(row.body)
    const read = readPlacementMapBytes(bytes)
    expect(read.kind).toBe(row.read)
    expectResolutions(read, row.resolve)
    // The same bytes through the network path: the loader, then the source rule.
    const network = await loadPlacementMap(MAP_URL, { fetch: (() => Promise.resolve(new Response(bytes as unknown as BodyInit, { status: 200 }))) as typeof fetch })
    const decision = pickPlacementMap({ network })
    expect(decision.status).toBe(row.read === 'map' ? 'fresh' : row.read)
    expectResolutions(decision.map, row.resolve)
  })
})

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

/** A `fetch` that answers on the table's clock: the status at `headersAtMs`, the end of the body at `completedAtMs`. */
function timedFetch(answer: Answer, body: Uint8Array | null): typeof fetch {
  return (() => {
    const completed = answer.completedAtMs
    if (completed === null) return new Promise<Response>(() => undefined)
    const headersAt = answer.headersAtMs ?? completed
    const withBody = body !== null && !NULL_BODY_STATUSES.has(answer.status) && (answer.status < 300 || answer.status > 399)
    const stream = withBody
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(body)
              controller.close()
            }, completed - headersAt)
          },
        })
      : null
    return new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(stream, { status: answer.status })), headersAt))
  }) as typeof fetch
}

describe('placement requests: transportCases', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the deadline is that of the artifact', () => {
    const source = ARTIFACT['x-placementSource'] as { deadline: { ms: number } }
    const reading = ARTIFACT['x-placementReading'] as { body: { maxBytes: number; maxDepth: number } }
    expect(PLACEMENT_REQUEST_DEADLINE_MS).toBe(source.deadline.ms)
    expect(PLACEMENTS_READ_MAX_BYTES).toBe(reading.body.maxBytes)
    expect(PLACEMENTS_READ_MAX_DEPTH).toBe(reading.body.maxDepth)
  })

  it.each(named(TABLE.transportCases))('%s', async (_name, row) => {
    vi.useFakeTimers()
    if (row.request === 'map') {
      const pending = loadPlacementMap(MAP_URL, { fetch: timedFetch(row.answer, row.answer.body === undefined ? null : bytesOf(row.answer.body)) })
      await vi.advanceTimersByTimeAsync(60_000)
      expect((await pending).kind).toBe(row.expected)
      return
    }
    const documentFetch = timedFetch(row.answer, new TextEncoder().encode(JSON.stringify(SHOWCASE)))
    const fetchFake = ((input: RequestInfo | URL) =>
      String(input) === MAP_URL ? Promise.resolve(new Response(mapText({ 'home.banner': { documentId: 'd1' } }))) : documentFetch(input)) as typeof fetch
    const pending = computePlacement('home.banner', { mapUrl: MAP_URL, documentUrl, fetch: fetchFake, lastKnown: false }, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(60_000)
    const state = await pending
    const expected = { read: { status: 'document' }, missing: { status: 'nothing', report: 'documentMissing' }, unreadable: { status: 'nothing', report: 'documentUnreadable' } }[row.expected]
    expect(state).toMatchObject(expected ?? {})
  })
})

describe('what the host hears: eventCases', () => {
  it.each(named(TABLE.eventCases))('%s', (_name, row) => {
    const heard: PlacementEvent[] = []
    let previous: PlacementSettled | null = null
    for (const state of row.states) {
      const event = placementEvent(previous, state)
      if (event !== null) heard.push(event)
      previous = state
    }
    expect(heard).toEqual(row.events)
  })
})

describe('what the reader remembers: cacheCases', () => {
  const projectMap = (project: string): string => `https://storage.test/orgs/o/projects/${project}/placements/published.json`
  const projectDocument = (project: string) => (id: string) => `https://storage.test/orgs/o/projects/${project}/documents/${id}/published.json`

  it.each(named(TABLE.cacheCases))('%s', async (_name, row) => {
    localStorage.clear()
    for (const [index, step] of row.steps.entries()) {
      const routes: Record<string, () => Response> = {
        [projectMap(step.project)]: () => (step.map.kind === 'map' ? new Response(step.map.text) : new Response('', { status: 503 })),
      }
      if (step.document !== undefined) {
        const answer = step.document
        routes[projectDocument(step.project)('d1')] = () =>
          answer === 'ok' ? json(SHOWCASE) : new Response('', { status: answer === 'notFound' ? 404 : 503 })
      }
      const state = await computePlacement('home.banner', { mapUrl: projectMap(step.project), documentUrl: projectDocument(step.project), fetch: network(routes).fetch }, new AbortController().signal)
      expect(state.status === 'loading' ? null : { status: state.status, report: state.report, mapStatus: state.mapStatus }, `step ${String(index)}`).toEqual(step.expected)
    }
    localStorage.clear()
  })
})

describe('placement: showingCases', () => {
  it.each(named(TABLE.showingCases))('%s', (_name, row) => {
    expect(placementShowing(row.resolution, row.document)).toEqual(row.expected)
  })
})

const instantMs = (instant: string): number => Date.parse(instant)

describe('placement schedule: scheduleCases', () => {
  it('the table is what the shared contract documents', () => {
    expect(TABLE.scheduleCases.length).toBe(37)
    expect(TABLE.scheduleCases.reduce((sum, row) => sum + row.checks.length, 0)).toBe(89)
  })

  it.each(named(TABLE.scheduleCases))('%s', (_name, row) => {
    const map = row.text === undefined ? readPlacementMap(row.json) : readPlacementMapText(row.text)
    for (const check of row.checks) {
      const at = `${check.place} at ${check.now}`
      expect(resolvePlacementAt(map, check.place, instantMs(check.now)), at).toEqual({ status: check.status, documentId: check.documentId, entry: check.entry })
      expect(nextPlacementBoundary(map, check.place, instantMs(check.now)), `${at}: next`).toBe(check.next === null ? null : instantMs(check.next))
    }
  })

  it('a map without a schedule answers as the permanent resolver does, at any moment', () => {
    const map = readPlacementMap({ placementsVersion: '1.0.0', placements: { 'a.b': { documentId: 'd1', entry: 'main' } } })
    for (const now of [0, Date.now(), 4_102_444_800_000]) {
      expect(resolvePlacementAt(map, 'a.b', now)).toEqual(resolvePlacement(map, 'a.b'))
      expect(nextPlacementBoundary(map, 'a.b', now)).toBeNull()
    }
    expect(resolvePlacementAt(map, 'x.y', 0).status).toBe('unknown')
  })
})

describe('the package mirrors the artifact', () => {
  it('the schedule block is that of the artifact', async () => {
    const block = ARTIFACT['x-placementSchedule'] as { instant: { pattern: string }; limits: { maxPerPlacement: number }; maxTimerMs: number }
    const { PLACEMENT_INSTANT_PATTERN, PLACEMENT_MAX_TIMER_MS } = await import('../src/placement-schedule')
    expect(PLACEMENT_INSTANT_PATTERN.source.replaceAll('\\/', '/')).toBe(new RegExp(block.instant.pattern).source.replaceAll('\\/', '/'))
    expect(PLACEMENT_MAX_TIMER_MS).toBe(block.maxTimerMs)
    expect(ARTIFACT['x-placementSchedule']).toMatchObject({
      window: { from: 'included', until: 'excluded' },
      reading: { notAnArray: 'no-schedule', brokenItem: 'skip', emptyWindow: 'skip', nullDocument: 'pause-empty', pauseEntry: 'ignore', nullEntry: 'absent', brokenPermanent: 'unreadable', overlap: 'latest-from-then-lowest-index', unknownFields: 'ignore' },
      resolve: 'active-scheduled-else-permanent',
      clock: 'device',
      nextBoundary: 'earliest-edge-after-now',
      recompute: ['next-boundary', 'map-read', 'app-foreground'],
      olderReaders: 'permanent-only',
    })
  })

  it('limits and forms are those of contract/placements.json', () => {
    const limits = ARTIFACT['x-limits']
    expect(isPlacementName('a'.repeat(limits.name.maxLength))).toBe(true)
    expect(isPlacementName('a'.repeat(limits.name.maxLength + 1))).toBe(false)
    const nameRule = new RegExp(limits.name.pattern)
    for (const name of ['home.banner', 'promo.raffle-button', 'Home', 'home..x', '.home', 'home.', 'a b', '__proto__', '', 'constructor', 'a.1-b']) {
      expect(isPlacementName(name), name).toBe(nameRule.test(name) && name.length <= limits.name.maxLength)
    }
    // Forms of document id and entry, through the real resolver.
    const idRule = new RegExp(limits.documentId.pattern)
    const entryRule = new RegExp(limits.entry.pattern)
    const probe = (documentId: string, entry: string): string => {
      const map = readPlacementMap({ placementsVersion: '1.0.0', placements: { 'a.b': { documentId, entry } } })
      return resolvePlacement(map, 'a.b').status
    }
    for (const id of ['d1', '..', '.', 'a/b', 'a..b', 'D_1.x-y', '', 'x'.repeat(64), 'x'.repeat(65), 'a b', '%2e%2e']) {
      for (const entry of ['raffle', 'Raffle', '-x', '9-x', 'x'.repeat(48), 'x'.repeat(49), 'a b']) {
        const ok = idRule.test(id) && entryRule.test(entry) && entry.length <= limits.entry.maxLength
        expect(probe(id, entry), `${id} / ${entry}`).toBe(ok ? 'document' : 'unreadable')
      }
    }
  })

  it('the version and the reading policy are those of the artifact', () => {
    expect(READER_PLACEMENTS_VERSION).toBe(ARTIFACT['x-placementsVersion'])
    expect(ARTIFACT['x-placementReading']).toMatchObject({ unknownFields: 'ignore', keyLookup: 'own-keys-only', limits: 'publish-only', otherMajor: 'unsupported', notAMap: 'corrupt' })
    expect(ARTIFACT['x-placementSource']).toMatchObject({ fallbackOrder: ['lastKnown', 'bundled'], rememberOnlyFreshNetwork: true })
  })
})

describe('trust boundary', () => {
  const hostile = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '../etc', 'a'.repeat(5000), 'home.banner\n', '\u0000', 'HOME.BANNER']
  it.each(hostile)('name %j resolves to unknown on a map that holds other places', (name) => {
    const map = readPlacementMapText('{"placementsVersion":"1.0.0","placements":{"home.banner":{"documentId":"d1"}}}')
    expect(resolvePlacement(map, name).status).toBe('unknown')
  })

  it('a prototype key inside the map is not a placement and spoils nothing', () => {
    const map = readPlacementMapText('{"placementsVersion":"1.0.0","__proto__":{"x":1},"placements":{"__proto__":{"documentId":"evil"},"home.banner":{"documentId":"d1"}}}')
    expect(resolvePlacement(map, 'home.banner')).toEqual({ status: 'document', documentId: 'd1', entry: null })
    expect(resolvePlacement(map, '__proto__').status).toBe('unknown')
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('a map over the publisher’s count limit is read: only the reader’s byte and depth limits refuse', () => {
    const places: Record<string, unknown> = {}
    for (let index = 0; index < 500; index += 1) places[`p.n${String(index)}`] = { documentId: `d${String(index)}` }
    const map = readPlacementMap({ placementsVersion: '1.2.0', placements: places })
    expect(resolvePlacement(map, 'p.n499').documentId).toBe('d499')
  })
})

/* ───────────────────────────── the component on a fake network ───────────────────────────── */

const MAP_URL = 'https://cdn.test/placements/published.json'
const documentUrl = (id: string): string => `https://cdn.test/documents/${id}/published.json`

const mapText = (places: Record<string, unknown>): string => JSON.stringify({ placementsVersion: '1.0.0', placements: places })

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

interface Net {
  readonly fetch: typeof globalThis.fetch
  readonly urls: string[]
}
function network(routes: Record<string, () => Response | Promise<Response>>): Net {
  const urls: string[] = []
  const fake = (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    urls.push(url)
    const route = routes[url]
    if (route === undefined) return Promise.resolve(new Response('not found', { status: 404 }))
    return Promise.resolve(route())
  }
  return { fetch: fake as typeof globalThis.fetch, urls }
}

function memoryStore(initial?: string): PlacementMapStore & { text: string | undefined } {
  const store = {
    text: initial,
    read: () => store.text,
    write: (text: string) => {
      store.text = text
    },
  }
  return store
}

const mapRoute = (places: Record<string, unknown>) => ({ [MAP_URL]: () => json(JSON.parse(mapText(places))) })
const showcaseRoute = { [documentUrl('d-show')]: () => json(SHOWCASE) }

describe('<HotlayoutPlacement>', () => {
  it('draws the document of the placement, from the entry point the map names', async () => {
    const net = network({ ...mapRoute({ 'home.banner': { documentId: 'd-show', entry: 'mission' } }), ...showcaseRoute })
    const shown: unknown[] = []
    const { container } = render(
      <HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} onScreenChange={(screen) => shown.push(screen)} />,
    )
    await waitFor(() => expect(container.querySelector('[data-hotlayout]')).not.toBeNull())
    await waitFor(() => expect(shown.length).toBeGreaterThan(0))
    expect(shown[0]).toMatchObject({ screenId: 'mission', entry: 'mission', documentId: 'rewards-showcase' })
  })

  it('an entry point the document lost starts at the initial screen and tells the host', async () => {
    const net = network({ ...mapRoute({ 'home.banner': { documentId: 'd-show', entry: 'gone-entry' } }), ...showcaseRoute })
    const events: PlacementStatusEvent[] = []
    const shown: unknown[] = []
    const { container } = render(
      <HotlayoutPlacement
        name="home.banner"
        mapUrl={MAP_URL}
        documentUrl={documentUrl}
        fetch={net.fetch}
        lastKnown={false}
        onPlacementStatus={(event) => events.push(event)}
        onScreenChange={(screen) => shown.push(screen)}
      />,
    )
    await waitFor(() => expect(container.querySelector('[data-hotlayout]')).not.toBeNull())
    expect(events).toEqual([{ name: 'home.banner', status: 'document', report: 'entryMissing', mapStatus: 'fresh', documentId: 'd-show', entry: null }])
    await waitFor(() => expect(shown.length).toBeGreaterThan(0))
    expect(shown[0]).toMatchObject({ screenId: 'home', entry: null })
  })

  it.each<[string, Record<string, unknown>, string, PlacementReport]>([
    ['an empty placement', { 'home.banner': { documentId: null } }, 'home.banner', 'empty'],
    ['a placement the map lacks', { 'home.banner': { documentId: 'd-show' } }, 'cart.banner', 'unknown'],
    ['a broken entry of that placement', { 'home.banner': { documentId: '../secret' } }, 'home.banner', 'unreadable'],
    ['a document that is gone', { 'home.banner': { documentId: 'd-gone' } }, 'home.banner', 'documentMissing'],
  ])('%s draws nothing and tells the host once', async (_label, places, name, report) => {
    const net = network({ ...mapRoute(places), ...showcaseRoute })
    const events: PlacementStatusEvent[] = []
    const { container } = render(
      <HotlayoutPlacement name={name} mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} onPlacementStatus={(event) => events.push(event)} />,
    )
    await waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toEqual({ name, status: 'nothing', report, mapStatus: 'fresh', documentId: null, entry: null })
    expect(container.innerHTML).toBe('')
    // A path-leaving id never reaches the address builder.
    expect(net.urls.some((url) => url.includes('..'))).toBe(false)
  })

  it('a document that is not a document, or of another schema major, draws nothing', async () => {
    const net = network({
      ...mapRoute({ 'a.html': { documentId: 'd-html' }, 'a.major': { documentId: 'd-major' } }),
      [documentUrl('d-html')]: () => new Response('<html>nope</html>', { status: 200 }),
      [documentUrl('d-major')]: () => json({ ...SHOWCASE, schemaVersion: '99.0.0' }),
    })
    for (const name of ['a.html', 'a.major']) {
      const events: PlacementStatusEvent[] = []
      const { container, unmount } = render(
        <HotlayoutPlacement name={name} mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} onPlacementStatus={(event) => events.push(event)} />,
      )
      await waitFor(() => expect(events).toHaveLength(1))
      expect(events[0]?.report).toBe('documentUnreadable')
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })

  it('a map that was never published: every place is unknown; no network: bundled map; a broken map: unreadable', async () => {
    const bundled = mapText({ 'home.banner': { documentId: 'd-show' } })
    const cases: [string, Net, string | undefined, PlacementStatusEvent | 'drawn'][] = [
      ['404', network({}), undefined, { name: 'home.banner', status: 'nothing', report: 'unknown', mapStatus: 'notPublished', documentId: null, entry: null }],
      ['offline with a bundled copy', network({ [MAP_URL]: () => new Response('boom', { status: 503 }), ...showcaseRoute }), bundled, 'drawn'],
      ['html from a proxy', network({ [MAP_URL]: () => new Response('<html></html>', { status: 200 }) }), undefined, { name: 'home.banner', status: 'nothing', report: 'unreadable', mapStatus: 'corrupt', documentId: null, entry: null }],
      ['another major', network({ [MAP_URL]: () => json({ placementsVersion: '2.0.0', placements: {} }) }), undefined, { name: 'home.banner', status: 'nothing', report: 'unreadable', mapStatus: 'unsupported', documentId: null, entry: null }],
    ]
    for (const [label, net, copy, expected] of cases) {
      const events: PlacementStatusEvent[] = []
      const { container, unmount } = render(
        <HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} bundledMap={copy} onPlacementStatus={(event) => events.push(event)} />,
      )
      if (expected === 'drawn') await waitFor(() => expect(container.querySelector('[data-hotlayout]'), label).not.toBeNull())
      else {
        await waitFor(() => expect(events, label).toHaveLength(1))
        expect(events[0], label).toEqual(expected)
        expect(container.innerHTML, label).toBe('')
      }
      unmount()
    }
  })

  it('only a fresh readable map becomes the last known one; a broken answer falls back to it', async () => {
    const store = memoryStore()
    const good = network({ ...mapRoute({ 'home.banner': { documentId: 'd-show' } }), ...showcaseRoute })
    const first = render(<HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={good.fetch} lastKnown={store} />)
    await waitFor(() => expect(first.container.querySelector('[data-hotlayout]')).not.toBeNull())
    expect(store.text).toBe(mapText({ 'home.banner': { documentId: 'd-show' } }))
    first.unmount()

    const remembered = store.text
    const broken = network({ [MAP_URL]: () => new Response('{ not json', { status: 200 }), ...showcaseRoute })
    const events: PlacementStatusEvent[] = []
    const second = render(
      <HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={broken.fetch} lastKnown={store} onPlacementStatus={(event) => events.push(event)} />,
    )
    await waitFor(() => expect(second.container.querySelector('[data-hotlayout]')).not.toBeNull())
    expect(store.text).toBe(remembered)
    // The document stands, from the last known map: the host hears that, and why the map is not fresh.
    expect(events).toEqual([{ name: 'home.banner', status: 'document', report: null, mapStatus: 'corrupt', documentId: 'd-show', entry: null }])
  })

  describe('schedule: the clock of the device decides, without the network', () => {
    const START = '2026-12-01T00:00:10Z'
    const scheduledRoutes = (places: Record<string, unknown>) => ({ ...mapRoute(places), ...showcaseRoute, [documentUrl('d-promo')]: () => json(SHOWCASE) })
    /** A clock that starts `leadMs` before `edge` and then runs in real time, so a timer set for `edge` fires after ~`leadMs`. */
    const clockBefore = (edge: string, leadMs: number): (() => number) => {
      const begun = Date.now()
      return () => Date.parse(edge) - leadMs + (Date.now() - begun)
    }

    it('swaps the permanent document for the scheduled one at the boundary, and reads the map once', async () => {
      const net = network(scheduledRoutes({ 'home.banner': { documentId: 'd-show', schedule: [{ documentId: 'd-promo', entry: 'mission', from: START, until: '2026-12-02T00:00:00Z' }] } }))
      const events: PlacementStatusEvent[] = []
      render(<HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} clock={clockBefore(START, 600)} onPlacementStatus={(event) => events.push(event)} />)
      await waitFor(() => expect(events).toHaveLength(2), { timeout: 4000 })
      expect(events.map((event) => [event.status, event.documentId, event.entry])).toEqual([
        ['document', 'd-show', null],
        ['document', 'd-promo', 'mission'],
      ])
      expect(net.urls.filter((url) => url === MAP_URL)).toHaveLength(1)
    })

    it('a pause draws nothing for its window, then the permanent document returns', async () => {
      const net = network(scheduledRoutes({ 'home.banner': { documentId: 'd-show', schedule: [{ documentId: null, entry: '../broken', from: '2026-12-01T00:00:00Z', until: START }] } }))
      const events: PlacementStatusEvent[] = []
      const { container } = render(
        <HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} clock={clockBefore(START, 600)} onPlacementStatus={(event) => events.push(event)} />,
      )
      await waitFor(() => expect(events).toHaveLength(1))
      expect(events[0]).toMatchObject({ status: 'nothing', report: 'empty' })
      expect(container.innerHTML).toBe('')
      await waitFor(() => expect(events).toHaveLength(2), { timeout: 4000 })
      expect(events[1]).toMatchObject({ status: 'document', report: null, documentId: 'd-show' })
      await waitFor(() => expect(container.querySelector('[data-hotlayout]')).not.toBeNull())
    })

    it('decides again when the app comes back to the foreground, even if the clock jumped', async () => {
      const net = network(scheduledRoutes({ 'home.banner': { documentId: 'd-show', schedule: [{ documentId: 'd-promo', from: START, until: '2026-12-02T00:00:00Z' }] } }))
      let nowMs = Date.parse('2026-11-30T00:00:00Z')
      const events: PlacementStatusEvent[] = []
      render(<HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} refreshOnVisible={false} clock={() => nowMs} onPlacementStatus={(event) => events.push(event)} />)
      await waitFor(() => expect(events).toHaveLength(1))
      expect(events[0]).toMatchObject({ documentId: 'd-show' })
      nowMs = Date.parse('2026-12-01T12:00:00Z')
      document.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => expect(events).toHaveLength(2))
      expect(events[1]).toMatchObject({ status: 'document', documentId: 'd-promo' })
      // The map was not asked again: only the clock moved.
      expect(net.urls.filter((url) => url === MAP_URL)).toHaveLength(1)
    })

    it('a boundary beyond the longest timer is cut, and a clock that is not a number falls back to the device clock', async () => {
      const net = network(scheduledRoutes({ 'home.banner': { documentId: 'd-show', schedule: [{ documentId: 'd-promo', from: '2090-01-01T00:00:00Z', until: '2099-12-31T23:59:59Z' }] } }))
      const events: PlacementStatusEvent[] = []
      const timeouts: number[] = []
      const real = globalThis.setTimeout
      const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...rest: unknown[]) => {
        timeouts.push(delay ?? 0)
        return real(handler as () => void, delay, ...rest)
      }) as typeof setTimeout)
      render(<HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={net.fetch} lastKnown={false} clock={() => Number.NaN} onPlacementStatus={(event) => events.push(event)} />)
      await waitFor(() => expect(events).toHaveLength(1))
      spy.mockRestore()
      // The boundary is decades away: the timer is cut to the longest a timer can hold.
      expect(Math.max(...timeouts)).toBe(2 ** 31 - 1)
    })
  })

  it('the hook returns plain states and survives a network that throws', async () => {
    const states: PlacementState[] = []
    function Probe(): null {
      states.push(usePlacement('home.banner', { mapUrl: MAP_URL, documentUrl, fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch, lastKnown: false }))
      return null
    }
    render(<Probe />)
    await waitFor(() => expect(states.at(-1)?.status).toBe('nothing'))
    expect(states[0]).toEqual({ status: 'loading' })
    expect(states.at(-1)).toEqual({ status: 'nothing', report: 'unreadable', mapStatus: 'offline' })
  })

  it('loadPlacementMap sorts answers and sends no custom headers', async () => {
    const seen: (RequestInit | undefined)[] = []
    const answer = (status: number, body = ''): typeof fetch =>
      ((_url: unknown, init?: RequestInit) => {
        seen.push(init)
        return Promise.resolve(new Response(body, { status }))
      }) as typeof fetch
    expect(await loadPlacementMap(MAP_URL, { fetch: answer(200, 'x') })).toEqual({ kind: 'map', text: 'x' })
    expect(await loadPlacementMap(MAP_URL, { fetch: answer(404) })).toEqual({ kind: 'notFound' })
    expect(await loadPlacementMap(MAP_URL, { fetch: answer(403) })).toEqual({ kind: 'offline' })
    expect(await loadPlacementMap(MAP_URL, { fetch: answer(500) })).toEqual({ kind: 'offline' })
    for (const init of seen) expect(init?.headers).toBeUndefined()
  })
})

describe('server rendering', () => {
  beforeEach(() => {
    for (const name of ['window', 'document', 'navigator', 'localStorage']) vi.stubGlobal(name, undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the loading state without touching the browser or the network', () => {
    const fetchSpy = vi.fn()
    expect(typeof window).toBe('undefined')
    const html = renderToString(
      <HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} fetch={fetchSpy as unknown as typeof fetch} loading={<i data-testid="wait">…</i>} />,
    )
    expect(html).toContain('data-testid="wait"')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(renderToString(<HotlayoutPlacement name="home.banner" mapUrl={MAP_URL} documentUrl={documentUrl} />)).toBe('')
  })
})
