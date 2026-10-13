/**
 * ACTION CATALOG, ANALYTICS EVENT, SCREEN SHOWN: the same case table as the reference implementation
 * (checked separately), run against the `@hotlayout/react` PACKAGE (schema 9.8.0).
 *
 * `contract/fixtures/actions/action-cases.json` is shared by all readers and written by hand. Three
 * of its tables belong to the reader:
 *
 *  • `formCases`   — a parameter value against the address form: a mirror of `action-catalog.ts`
 *                    and, separately, a check built ONLY from the artifact expressions;
 *  • `handedCases` — what the host receives: a real `HotlayoutScreen`, a real press;
 *  • `flowCases`   — the stack, the analytics event, the handed action and the screen-shown event
 *                    after each step, plain and in `StrictMode`.
 *
 * `schemaCases` and `documentCases` concern structure and the builder validator; for the reader they
 * mean one thing: it does not crash on any such action, and what it delivers to the host has the
 * shape the contract promises.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutAction, HotlayoutReport, ScreenShown, TrackEvent, UiDocument, UiNode } from '../src/index'
import { ACTION_CATALOG, ACTION_URL_MAX, FORBIDDEN_LINK_SCHEMES, paramFormProblem } from '../src/action-catalog'
import type { ActionParamForm } from '../src/action-catalog'
import { SCREEN_SHOWN_CAUSES, SCREEN_SHOWN_FIELDS } from '../src/screen-shown'

afterEach(cleanup)

type Scope = Readonly<Record<string, unknown>>
interface Repeat {
  readonly repeat: { readonly prefix: string; readonly char: string; readonly length: number }
}
interface FormCase {
  readonly name: string
  readonly form: ActionParamForm
  readonly value?: string | null
  readonly repeat?: Repeat['repeat']
  readonly problem: string | null
}
interface ActionRow {
  readonly name: string
  readonly action: Record<string, unknown>
}
interface HandedCase extends ActionRow {
  readonly data: Scope
  readonly handed: HotlayoutAction
}
interface Instance {
  readonly item: string
  readonly fields: Scope
}
interface Expect {
  readonly stack: readonly string[]
  readonly track: TrackEvent | null
  readonly handed: HotlayoutAction | null
  readonly shown: Shown | null
}
type Shown = Omit<ScreenShown, 'name'>
interface Step {
  readonly do: 'press' | 'restart' | 'rerender' | 'newVersion'
  readonly action?: Record<string, unknown>
  /** `press` with `repeat: true` is the auto-repeat of a held activation key. */
  readonly repeat?: true
  /** `newVersion`: the screens of a new version of the same document (required), then `initial` and `entryPoints` as optional replacements. */
  readonly screens?: Readonly<Record<string, 'page' | 'modal'>>
  readonly initial?: string
  readonly entryPoints?: Readonly<Record<string, string>>
  readonly instances?: readonly Instance[]
  readonly cancelled?: true
  readonly entry?: string | null
  readonly expect: Expect
}
interface FlowCase {
  readonly name: string
  readonly documentId: string
  readonly screens: Readonly<Record<string, 'page' | 'modal'>>
  readonly initial: string
  readonly entryPoints: Readonly<Record<string, string>>
  readonly entry: string | null
  readonly data: Scope
  readonly start: { readonly stack: readonly string[]; readonly shown: Shown }
  readonly steps: readonly Step[]
}

/** `{ repeat: … }` in place of a string: a string of the requested length; other values as is. */
function expand<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map((entry: unknown) => expand(entry)) as Value
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 1 && keys[0] === 'repeat') {
    const { prefix, char, length } = (record as unknown as Repeat).repeat
    return (prefix + char.repeat(Math.max(0, length - prefix.length))) as Value
  }
  const expanded: Record<string, unknown> = {}
  // `defineProperty`, not assignment: an own `__proto__` key from the table must stay an own key.
  for (const key of keys) Object.defineProperty(expanded, key, { value: expand(record[key]), enumerable: true, writable: true, configurable: true })
  return expanded as Value
}

const TABLE = expand(
  JSON.parse(readFileSync('contract/fixtures/actions/action-cases.json', 'utf8')) as {
    readonly urlMaxLength: number
    readonly formCases: readonly FormCase[]
    readonly schemaCases: readonly (ActionRow & { readonly valid: boolean })[]
    readonly documentCases: readonly ActionRow[]
    readonly handedCases: readonly HandedCase[]
    readonly flowCases: readonly FlowCase[]
  },
)
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as {
  readonly 'x-actions': {
    readonly catalog: readonly { readonly type: string }[]
    readonly forms: {
      readonly httpsUrl: { readonly pattern: string; readonly maxLength: number }
      readonly appLink: { readonly pattern: string; readonly schemePattern: string; readonly maxLength: number; readonly forbiddenSchemes: readonly string[] }
    }
    readonly problems: readonly string[]
    readonly track: { readonly namePattern: string; readonly eventMaxLength: number; readonly paramValueMaxLength: number }
  }
  readonly 'x-screenShown': { readonly causes: readonly string[]; readonly fields: readonly string[] }
}

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)

const formValue = (row: FormCase): string | undefined => (row.repeat === undefined ? (row.value ?? undefined) : row.repeat.prefix + row.repeat.char.repeat(row.repeat.length - row.repeat.prefix.length))

describe('the action table in the package: structure', () => {
  it('the table is in place: the row count and unique names', () => {
    expect(TABLE.formCases.length).toBeGreaterThanOrEqual(80)
    expect(TABLE.handedCases.length).toBeGreaterThanOrEqual(35)
    expect(TABLE.flowCases.length).toBeGreaterThanOrEqual(24)
    // Eleven section-switch rows (9.12.0): none of the flows is skipped.
    expect(TABLE.flowCases.filter((row) => row.name.startsWith('9.12 sections:'))).toHaveLength(11)
    for (const rows of [TABLE.formCases, TABLE.schemaCases, TABLE.documentCases, TABLE.handedCases, TABLE.flowCases]) expect(new Set(rows.map((row) => row.name)).size).toBe(rows.length)
  })

  it('the catalog mirror = the artifact x-actions block; reasons and event fields are from it too', () => {
    expect(ACTION_CATALOG).toEqual(ARTIFACT['x-actions'].catalog)
    expect(ARTIFACT['x-actions'].catalog.some((entry) => entry.type === 'navigate.section')).toBe(true)
    expect(ACTION_URL_MAX).toBe(ARTIFACT['x-actions'].forms.httpsUrl.maxLength)
    expect(ACTION_URL_MAX).toBe(TABLE.urlMaxLength)
    expect([...FORBIDDEN_LINK_SCHEMES]).toEqual(ARTIFACT['x-actions'].forms.appLink.forbiddenSchemes)
    expect([...SCREEN_SHOWN_CAUSES]).toEqual(ARTIFACT['x-screenShown'].causes)
    expect([...SCREEN_SHOWN_FIELDS]).toEqual(ARTIFACT['x-screenShown'].fields)
    // The refusal reasons the table knows are exactly those in the artifact.
    const problems = new Set(TABLE.formCases.flatMap((row) => (row.problem === null ? [] : [row.problem])))
    for (const problem of problems) expect(ARTIFACT['x-actions'].problems).toContain(problem)
  })
})

describe('parameter shape: the mirror and the artifact expressions', () => {
  /** A check built ONLY from the artifact data: how a reader would write it without our code. */
  function byArtifact(form: ActionParamForm, value: string | undefined): string | null {
    const forms = ARTIFACT['x-actions'].forms
    if (value === undefined || value === '') return 'missing'
    if (form === 'screenId') return null
    if (value.length > forms.httpsUrl.maxLength) return 'too-long'
    if (form === 'httpsUrl') {
      if (!value.startsWith('https://')) return 'not-https'
      return new RegExp(forms.httpsUrl.pattern).test(value) ? null : 'malformed'
    }
    const match = new RegExp(forms.appLink.pattern).exec(value)
    if (match === null || !new RegExp(forms.appLink.schemePattern).test(match[1] ?? '')) return 'malformed'
    return forms.appLink.forbiddenSchemes.includes(match[1] ?? '') ? 'forbidden-scheme' : null
  }

  it.each(named(TABLE.formCases))('%s', (_name, row) => {
    expect(paramFormProblem(row.form, formValue(row)) ?? null).toBe(row.problem)
    expect(byArtifact(row.form, formValue(row))).toBe(row.problem)
  })
})

/* ─────────────── a real screen, real presses ─────────────── */

const node = (type: string, id: string, props: Record<string, unknown>, children?: readonly UiNode[]): UiNode => ({ id, type, props, ...(children === undefined ? {} : { children }) })
const button = (id: string, action: unknown): UiNode => node('Button', id, { label: { kind: 'literal', value: id }, action })

interface Seen {
  /** Everything the host received, in order: `track`, `action`, `shown`. */
  readonly log: { readonly kind: 'track' | 'action' | 'shown'; readonly value: unknown }[]
  readonly reports: HotlayoutReport[]
}

function handlers(seen: Seen, cancel: { value: boolean } = { value: false }): Record<string, unknown> {
  return {
    onAction: (action: HotlayoutAction) => seen.log.push({ kind: 'action', value: action }),
    onTrack: (event: TrackEvent) => seen.log.push({ kind: 'track', value: event }),
    onScreenChange: (screen: ScreenShown) => seen.log.push({ kind: 'shown', value: screen }),
    onNavigate: () => (cancel.value ? false : undefined),
    onReport: (report: HotlayoutReport) => seen.reports.push(report),
  }
}

const topLayer = (container: Element): Element => {
  const layers = container.querySelectorAll('[data-hl-screen]')
  const layer = layers[layers.length - 1]
  if (layer === undefined) throw new Error('no screen was drawn')
  return layer
}

describe('what the host receives (`handedCases`), by a real press', () => {
  it.each(named(TABLE.handedCases))('%s', (_name, row) => {
    const seen: Seen = { log: [], reports: [] }
    const document = {
      schemaVersion: '9.8.0',
      documentId: 'handed',
      name: 'handed',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: node('Screen', 'root', {}, [button('go', row.action)]) }],
    } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} data={row.data} {...handlers(seen)} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const actions = seen.log.filter((entry) => entry.kind === 'action')
    expect(actions).toHaveLength(1)
    expect(actions[0]?.value).toEqual(row.handed)
    // Fields that cannot be in a handed action.
    for (const field of ['track', 'paramBindings', 'carryRecord']) expect(Object.hasOwn(actions[0]?.value as object, field)).toBe(false)
  })

  it('the handed action and its params are frozen: the host cannot change what the screen opens with', () => {
    const seen: Seen = { log: [], reports: [] }
    const document = { schemaVersion: '9.8.0', documentId: 'f', name: 'f', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: node('Screen', 'root', {}, [button('go', { type: 'openUrl', params: { url: 'https://example.com' } })]) }] } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} {...handlers(seen)} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const action = seen.log.find((entry) => entry.kind === 'action')?.value as HotlayoutAction
    expect(Object.isFrozen(action) && Object.isFrozen(action.params) && Object.isFrozen(action.standard)).toBe(true)
  })
})

interface Version {
  readonly screens: Readonly<Record<string, 'page' | 'modal'>>
  readonly initial: string
  readonly entryPoints: Readonly<Record<string, string>>
}

/**
 * A flow document: on the screen where a step is made there is the step button, bare or in a
 * chain of lists. There may be several `newVersion` steps, so there is one document per version:
 * the step button lies in the version that is current AT THE MOMENT of the step.
 */
function documentFor(row: FlowCase): { readonly make: (version?: number) => UiDocument; readonly collections: Record<string, readonly Scope[]>; readonly versionAt: (index: number) => number } {
  const collections: Record<string, readonly Scope[]> = {}
  const versions: Version[] = [{ screens: row.screens, initial: row.initial, entryPoints: row.entryPoints }]
  const children: Record<string, UiNode[]>[] = [Object.fromEntries(Object.keys(row.screens).map((screenId) => [screenId, []]))]
  const versionOfStep: number[] = []
  let stack = [...row.start.stack]
  row.steps.forEach((step, index) => {
    if (step.do === 'newVersion') {
      const before = versions[versions.length - 1]!
      const screens = step.screens ?? {}
      versions.push({ screens, initial: step.initial ?? before.initial, entryPoints: step.entryPoints ?? before.entryPoints })
      children.push(Object.fromEntries(Object.keys(screens).map((screenId) => [screenId, []])))
    }
    versionOfStep.push(versions.length - 1)
    if (step.do === 'press' && step.action !== undefined) {
      const screenId = stack[stack.length - 1] ?? row.initial
      let target = button(`step-${String(index)}`, step.action)
      const instances = step.instances ?? []
      for (let depth = instances.length - 1; depth >= 0; depth -= 1) {
        const instance = instances[depth]
        if (instance === undefined) continue
        const source = `c${String(index)}x${String(depth)}`
        collections[source] = [instance.fields]
        target = node('Repeater', `list-${String(index)}-${String(depth)}`, { source, item: instance.item }, [target])
      }
      children[versions.length - 1]![screenId]?.push(target)
    }
    stack = [...step.expect.stack]
  })
  const make = (version = 0): UiDocument => {
    const spec = versions[version]!
    return {
      schemaVersion: '9.8.0',
      documentId: row.documentId,
      name: 'case',
      initialScreenId: spec.initial,
      entryPoints: { ...spec.entryPoints },
      screens: Object.entries(spec.screens).map(([screenId, presentation]) => ({
        screenId,
        name: screenId,
        root: node('Screen', `root-${screenId}`, {}, children[version]![screenId]),
        ...(presentation === 'modal' ? { presentation } : {}),
      })),
    }
  }
  return { make, collections, versionAt: (index) => versionOfStep[index] ?? 0 }
}

const shownOf = (screen: unknown): Shown => {
  const rest = screen as ScreenShown
  return { documentId: rest.documentId, screenId: rest.screenId, entry: rest.entry, presentation: rest.presentation, cause: rest.cause, depth: rest.depth, record: rest.record }
}

describe.each([
  ['plain', false],
  ['in StrictMode', true],
] as const)('flows (`flowCases`): %s', (_mode, strict) => {
  it.each(named(TABLE.flowCases))('%s', (_name, row) => {
    const { make, collections, versionAt } = documentFor(row)
    const seen: Seen = { log: [], reports: [] }
    const cancel = { value: false }
    const wrap = (element: React.ReactElement): React.ReactElement => (strict ? <StrictMode>{element}</StrictMode> : element)
    const screenOf = (entry: string | null, data: Scope = row.data, locale?: string, version = 0): React.ReactElement => (
      <HotlayoutScreen document={make(version)} data={data} collections={collections} entry={entry ?? undefined} locale={locale} {...handlers(seen, cancel)} />
    )

    const view = render(wrap(screenOf(row.entry)))
    // Start: exactly one show event with reason `entry`, no action, no analytics.
    expect(seen.log.map((entry) => entry.kind)).toEqual(['shown'])
    expect(shownOf(seen.log[0]?.value)).toEqual(row.start.shown)
    expect(topLayer(view.container).getAttribute('data-hl-screen')).toBe(row.start.stack[row.start.stack.length - 1])

    row.steps.forEach((step, index) => {
      seen.log.length = 0
      cancel.value = step.cancelled === true
      if (step.do === 'press') {
        const target = topLayer(view.container).querySelector(`[data-hl-node="step-${String(index)}"]`)
        if (target === null) throw new Error(`there is no step button ${String(index)} on the top screen`)
        if (step.repeat === true) {
          // Auto-repeat is not a press. A `keydown` with `repeat` that was NOT cancelled would mean the browser
          // sends one more `click` to a real button (jsdom does not, so we check the cancellation).
          expect(fireEvent.keyDown(target, { key: 'Enter', repeat: true })).toBe(false)
        } else fireEvent.click(target)
      } else if (step.do === 'restart') view.rerender(wrap(screenOf(step.entry ?? null)))
      else if (step.do === 'newVersion') view.rerender(wrap(screenOf(row.entry, row.data, undefined, versionAt(index))))
      else view.rerender(wrap(screenOf(row.entry, { ...row.data, 'unrelated.value': 'new data' }, 'uk')))

      const kinds = seen.log.map((entry) => entry.kind)
      const track = seen.log.filter((entry) => entry.kind === 'track')
      const actions = seen.log.filter((entry) => entry.kind === 'action')
      const shown = seen.log.filter((entry) => entry.kind === 'shown')

      // Exactly as many events as stated: an analytics event once per press, a show once per show.
      expect(track.map((entry) => entry.value)).toEqual(step.expect.track === null ? [] : [step.expect.track])
      expect(actions.map((entry) => entry.value)).toEqual(step.expect.handed === null ? [] : [step.expect.handed])
      expect(shown.map((entry) => shownOf(entry.value))).toEqual(step.expect.shown === null ? [] : [step.expect.shown])
      // Order: the analytics event first, then either the handed action or the show.
      expect(kinds).toEqual([...(step.expect.track === null ? [] : ['track']), ...(step.expect.handed === null ? [] : ['action']), ...(step.expect.shown === null ? [] : ['shown'])])

      const layers = [...view.container.querySelectorAll('[data-hl-screen]')].map((layer) => layer.getAttribute('data-hl-screen'))
      expect(layers[layers.length - 1]).toBe(step.expect.stack[step.expect.stack.length - 1])
    })
  })
})

describe('server render sends no events', () => {
  it('no table row produces an event on the server; the screen markup exists', () => {
    for (const row of TABLE.flowCases) {
      const { make, collections } = documentFor(row)
      const seen: Seen = { log: [], reports: [] }
      const html = renderToString(<HotlayoutScreen document={make()} data={row.data} collections={collections} entry={row.entry ?? undefined} {...handlers(seen)} />)
      expect(html).toContain(`data-hl-screen="${row.start.stack[row.start.stack.length - 1] ?? ''}"`)
      expect(seen.log).toEqual([])
    }
  })
})

/* ─────────────── untrusted input: an action does not crash the host ─────────────── */

describe('`schemaCases` and `documentCases`: a table action does not crash the reader', () => {
  const rows = [...TABLE.schemaCases.map((row) => [row.name, row.action] as const), ...TABLE.documentCases.map((row) => [row.name, row.action] as const)]

  it.each(rows)('%s', (_name, action) => {
    const seen: Seen = { log: [], reports: [] }
    const document = {
      schemaVersion: '9.8.0',
      documentId: 'schema',
      name: 'schema',
      initialScreenId: 'a',
      screens: [
        { screenId: 'a', name: 'a', root: node('Screen', 'root', {}, [button('go', action)]) },
        { screenId: 'delivery', name: 'delivery', root: node('Screen', 'root-d', {}, []) },
      ],
    } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} data={{ 'offer.url': 'https://example.com/x' }} {...handlers(seen)} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    for (const entry of seen.log) {
      if (entry.kind === 'track') {
        const event = entry.value as TrackEvent
        expect(event.event).toMatch(new RegExp(ARTIFACT['x-actions'].track.namePattern))
        expect(event.event.length).toBeLessThanOrEqual(ARTIFACT['x-actions'].track.eventMaxLength)
        for (const [key, value] of Object.entries(event.params ?? {})) {
          expect(key).toMatch(new RegExp(ARTIFACT['x-actions'].track.namePattern))
          expect(typeof value === 'string' && value.length <= ARTIFACT['x-actions'].track.paramValueMaxLength).toBe(true)
        }
      }
      if (entry.kind === 'action') {
        const handed = entry.value as HotlayoutAction
        expect(handed.type).toBe((action as { type: string }).type)
        expect(Object.getPrototypeOf(handed.params ?? {})).toBe(Object.prototype)
        for (const value of Object.values(handed.params ?? {})) expect(typeof value).toBe('string')
      }
    }
  })

  /*
   * Rows the structure rejects: the rest of the action works, and the rejected field goes into the report.
   * Exception: an own `__proto__` key (`{ "paramBindings": { "__proto__": … } }`) is dropped earlier by
   * the input guard (`withoutForbiddenKeys`, `protoKeyWithoutValidation: drop-entry`), so it never
   * reaches the action and there is nothing to report.
   */
  it.each(named(TABLE.schemaCases.filter((row) => !row.valid && !row.name.includes('__proto__'))))('rejected by the structure: %s is not silent', (_name, row) => {
    const seen: Seen = { log: [], reports: [] }
    const action = row.action
    if (typeof action.type !== 'string') return
    const named = ['track', 'carryRecord', 'paramBindings'].some((field) => action[field] !== undefined)
    if (!named) return
    const document = { schemaVersion: '9.8.0', documentId: 's', name: 's', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: node('Screen', 'root', {}, [button('go', row.action)]) }] } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} {...handlers(seen)} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    expect(seen.reports.filter((report) => report.kind === 'ignored-input').length).toBeGreaterThan(0)
  })
})

/* An action that is not an action, and hostile paths: the host does not crash, there is a report, the node is drawn. */
const handedOf = (seen: Seen): HotlayoutAction => seen.log.find((entry) => entry.kind === 'action')?.value as HotlayoutAction

describe('hostile action', () => {
  const run = (action: unknown, data: Scope = {}): Seen => {
    const seen: Seen = { log: [], reports: [] }
    const document = { schemaVersion: '9.8.0', documentId: 'h', name: 'h', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: node('Screen', 'root', {}, [button('go', action)]) }] } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} data={data} {...handlers(seen)} />)
    const target = view.container.querySelector('[data-hl-node="go"]')
    expect(target, 'the button is drawn').not.toBeNull()
    fireEvent.click(target!)
    view.unmount()
    return seen
  }

  it.each([
    ['string', 'openUrl'],
    ['number', 7],
    ['array', [{ type: 'openUrl' }]],
    ['null', null],
    ['object without type', { params: { url: 'https://example.com' } }],
    ['type is not a string', { type: { toString: 'x' } }],
  ] as const)('action as %s: nothing goes to the host, there is a report', (_name, action) => {
    const seen = run(action)
    expect(seen.log.filter((entry) => entry.kind !== 'shown')).toEqual([])
    expect(seen.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
  })

  it('paramBindings is not a map: the action works with the literal, there is a report', () => {
    for (const bindings of ['offer.url', ['offer.url'], 7, true]) {
      const seen = run({ type: 'openUrl', params: { url: 'https://example.com/a' }, paramBindings: bindings }, { 'offer.url': 'https://example.com/b' })
      expect((handedOf(seen)).standard).toEqual({ type: 'openUrl', url: 'https://example.com/a' })
      expect(seen.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
    }
  })

  it('a __proto__ / constructor path in paramBindings is not read and does not crash', () => {
    const hostile = JSON.parse('{"type":"openUrl","params":{"url":"https://example.com/a"},"paramBindings":{"url":"__proto__.polluted","text":"constructor.prototype.x"}}') as unknown
    const seen = run(hostile, { '__proto__.polluted': 'https://evil.example', 'constructor.prototype.x': 'evil' })
    const handed = handedOf(seen)
    expect(handed.standard).toEqual({ type: 'openUrl', url: 'https://example.com/a' })
    expect(handed.params).toEqual({ url: 'https://example.com/a' })
    expect(seen.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('a params key __proto__ / constructor is dropped, as it always was', () => {
    const hostile = JSON.parse('{"type":"openUrl","params":{"url":"https://example.com/a","constructor":"x"}}') as unknown
    const handed = handedOf(run(hostile))
    expect(handed.params).toEqual({ url: 'https://example.com/a' })
  })
})
