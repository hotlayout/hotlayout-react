/**
 * WRITE ACTIONS AND CHOICE FROM PLAIN NODES THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0).
 *
 * The shared rows are written by hand and run against every reader: the `write…` groups of
 * `contract/fixtures/actions/action-cases.json`, the `choice…`, `writeFormCases` and `emptiness…`
 * groups of `contract/fixtures/inputs/input-cases.json`. The reference implementation is
 * checked against the same rows elsewhere; this is
 * the third reader.
 *
 * Pure rows (the step of a press, the control a node is, the place in a group, the emptiness of a
 * value) go through the very functions the reader draws with; rows about a press and about a
 * finished screen go through a real `HotlayoutScreen` with real clicks and keys. No row is skipped.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument } from '../src/index'
import { ACTION_CATALOG } from '../src/action-catalog'
import { isConditionMet } from '../src/conditions'
import { CONDITION_RULES } from '../src/conditions'
import { choicePlaceIn, CHOICE_RULES, holdsWritten, WRITE_ACTION_RULES, writeControlOf, writeStepOf } from '../src/write-action'

afterEach(cleanup)

type Scope = Readonly<Record<string, unknown>>
interface Tree {
  readonly id: string
  readonly type: string
  readonly props?: Record<string, unknown>
  readonly children?: readonly Tree[]
  readonly visibleIf?: unknown
}
interface Repeat {
  readonly repeat: { readonly prefix: string; readonly char: string; readonly length: number }
}
type Action = Record<string, unknown>

/** `{ repeat: … }` in the place of a string is a string of that length; every other value as it is. */
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
  for (const key of keys) Object.defineProperty(expanded, key, { value: expand(record[key]), enumerable: true, writable: true, configurable: true })
  return expanded as Value
}

interface ActionTable {
  readonly writeCases: readonly { readonly name: string; readonly action: Action; readonly data: Scope; readonly step: { readonly kind: string; readonly path?: string; readonly value?: unknown } | null; readonly gate?: string; readonly host: readonly [string, unknown] | null }[]
  readonly writeControlCases: readonly { readonly name: string; readonly action: Action; readonly data: Scope; readonly control: { readonly role: string; readonly path: string; readonly on: boolean } | null }[]
  readonly writeSchemaCases: readonly { readonly name: string; readonly action: Action; readonly valid: boolean }[]
  readonly writeDocumentCases: readonly { readonly name: string; readonly action: Action; readonly issues: readonly unknown[] }[]
  readonly writeTreeCases: readonly { readonly name: string; readonly nodes: readonly Tree[]; readonly codes: readonly string[] }[]
  readonly writePressCases: readonly { readonly name: string; readonly nodes: readonly Tree[]; readonly presses: readonly { readonly node: string; readonly how: string }[]; readonly log: readonly (readonly unknown[])[]; readonly session: Scope; readonly data?: Scope; readonly writable?: readonly string[] }[]
}
interface InputTable {
  readonly choicePlaceCases: readonly { readonly name: string; readonly siblings: readonly Tree[]; readonly hidden?: readonly string[]; readonly places: Readonly<Record<string, readonly [number, number] | null>> }[]
  readonly choiceControlCases: readonly {
    readonly name: string
    readonly nodes: readonly Tree[]
    readonly invalidDocument?: boolean
    readonly session: Scope
    readonly expect: Readonly<Record<string, 'absent' | Expected>>
    readonly presses?: readonly string[]
    readonly after?: Readonly<Record<string, 'absent' | Expected>>
  }[]
  readonly writeFormCases: readonly { readonly name: string; readonly nodes: readonly Tree[]; readonly presses: readonly string[]; readonly disabled: Readonly<Record<string, readonly boolean[]>> }[]
  readonly emptinessCases: readonly { readonly name: string; readonly value?: unknown; readonly isEmpty: boolean; readonly isNotEmpty: boolean }[]
  readonly emptinessDocumentCases: readonly { readonly name: string; readonly condition: Record<string, unknown>; readonly codes: readonly string[] }[]
}
interface Expected {
  readonly role: string | null
  readonly checked?: boolean
  readonly pressed?: boolean
  readonly position?: number
  readonly size?: number
  readonly disabled?: boolean
}

const ACTIONS = expand(JSON.parse(readFileSync('contract/fixtures/actions/action-cases.json', 'utf8')) as ActionTable)
const INPUTS = expand(JSON.parse(readFileSync('contract/fixtures/inputs/input-cases.json', 'utf8')) as InputTable)
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as {
  readonly 'x-actions': { readonly catalog: readonly { readonly type: string }[]; readonly write: Record<string, unknown> }
  readonly 'x-choice': Record<string, unknown>
  readonly 'x-conditions': Record<string, unknown>
}

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const lit = (value: string): Record<string, unknown> => ({ kind: 'literal', value })

/* ─────────────── the screen the rows are drawn on ─────────────── */

interface Seen {
  /** In the order they happened: `['track', event]` and `['write', path, value]`. */
  readonly log: (readonly unknown[])[]
  readonly actions: unknown[]
  readonly reports: HotlayoutReport[]
}

function documentOf(children: readonly Tree[]): UiDocument {
  return {
    schemaVersion: '9.19.0',
    documentId: 'write-case',
    name: 'write',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

function show(children: readonly Tree[], data: Scope = {}, writablePaths?: readonly string[]): { readonly container: HTMLElement; readonly seen: Seen } {
  const seen: Seen = { log: [], actions: [], reports: [] }
  const view = render(
    <HotlayoutScreen
      document={documentOf(children)}
      data={data}
      writablePaths={writablePaths}
      onAction={(action) => seen.actions.push(action)}
      onWrite={(path, value) => seen.log.push(['write', path, value])}
      onTrack={(event) => seen.log.push(['track', event.event])}
      onReport={(report) => seen.reports.push(report)}
    />,
  )
  return { container: view.container, seen }
}

const nodeEl = (container: HTMLElement, id: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
  if (found === null) throw new Error(`no node ${id}`)
  return found
}

/** What a key does on a real button in a browser: Enter clicks on keydown, Space on keyup; `preventDefault` cancels it. */
function browserKey(target: HTMLElement, key: string, repeat = false): void {
  const prevented = !fireEvent.keyDown(target, { key, repeat })
  if (key === 'Enter' && !prevented && target.tagName === 'BUTTON') fireEvent.click(target)
  if (key === ' ' && target.tagName === 'BUTTON') {
    const upPrevented = !fireEvent.keyUp(target, { key })
    if (!prevented && !upPrevented && !repeat) fireEvent.click(target)
  }
}

function press(container: HTMLElement, id: string, how: string): void {
  const target = nodeEl(container, id)
  if (how === 'tap') fireEvent.click(target)
  else if (how === 'enter') browserKey(target, 'Enter')
  else if (how === 'space') browserKey(target, ' ')
  else if (how === 'enter-held') {
    browserKey(target, 'Enter')
    browserKey(target, 'Enter', true)
    browserKey(target, 'Enter', true)
  } else throw new Error(`unknown press ${how}`)
}

const button = (id: string, action: unknown, extra: Record<string, unknown> = {}): Tree => ({ id, type: 'Button', props: { label: lit(id), variant: 'secondary', fullWidth: false, action, ...extra } })

/* ─────────────── the blocks of the artifact ─────────────── */

describe('write actions: the blocks of the package are the blocks of the artifact', () => {
  it('the block `x-actions.write` is mirrored whole, the block `x-choice` whole, the block `x-conditions` whole', () => {
    expect(WRITE_ACTION_RULES).toEqual(ARTIFACT['x-actions'].write)
    expect(CHOICE_RULES).toEqual(ARTIFACT['x-choice'])
    expect(CONDITION_RULES).toEqual(ARTIFACT['x-conditions'])
  })

  it('the catalog carries the two write actions with the executor «reader» and the three forms of the parameters', () => {
    const catalog = ARTIFACT['x-actions'].catalog
    expect(ACTION_CATALOG).toEqual(catalog)
    const set = ACTION_CATALOG.find((entry) => entry.type === 'setValue')
    const toggle = ACTION_CATALOG.find((entry) => entry.type === 'toggleValue')
    expect(set?.executor).toBe('reader')
    expect(toggle?.executor).toBe('reader')
    expect(set?.params.map((param) => [param.name, param.form, param.bindable])).toEqual([
      ['path', 'dataPath', false],
      ['value', 'literal', false],
      ['valueType', 'valueType', false],
    ])
  })

  it('the table is on the place: the rows are counted, the names do not repeat', () => {
    expect([ACTIONS.writeCases.length, ACTIONS.writeControlCases.length, ACTIONS.writeSchemaCases.length, ACTIONS.writeDocumentCases.length, ACTIONS.writeTreeCases.length, ACTIONS.writePressCases.length]).toEqual([67, 22, 14, 47, 11, 15])
    expect([INPUTS.choicePlaceCases.length, INPUTS.choiceControlCases.length, INPUTS.writeFormCases.length, INPUTS.emptinessCases.length, INPUTS.emptinessDocumentCases.length]).toEqual([11, 15, 6, 14, 10])
    for (const group of [ACTIONS.writeCases, ACTIONS.writeControlCases, ACTIONS.writeSchemaCases, ACTIONS.writeDocumentCases, ACTIONS.writeTreeCases, ACTIONS.writePressCases, INPUTS.choicePlaceCases, INPUTS.choiceControlCases, INPUTS.writeFormCases, INPUTS.emptinessCases, INPUTS.emptinessDocumentCases])
      expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })
})

/* ─────────────── what a press writes (writeCases) ─────────────── */

describe('writeCases: the step of a press', () => {
  it.each(named(ACTIONS.writeCases))('%s', (_name, row) => {
    const step = writeStepOf(row.action as { type: string }, (path) => row.data[path])
    if (row.step === null) expect(step).toBeUndefined()
    else expect(step).toEqual(row.step)
  })
})

describe('writeCases: the press on a real screen — the host gets the typed value and nothing goes to onAction', () => {
  it.each(named(ACTIONS.writeCases))('%s', (_name, row) => {
    const { container, seen } = show([button('go', row.action)], row.data)
    fireEvent.click(nodeEl(container, 'go'))
    const writes = seen.log.filter((entry) => entry[0] === 'write').map((entry) => [entry[1], entry[2]])
    expect(writes).toEqual(row.host === null ? [] : [row.host])
    // The host never gets a write action as an action of the application — valid or not.
    expect(seen.actions.filter((action) => ['setValue', 'toggleValue'].includes((action as { type?: string }).type ?? ''))).toEqual([])
    if (row.gate === 'refused') expect(seen.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
    if (row.step?.kind === 'invalid') expect(seen.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
  })

  it('a path the gate of the host refuses (writablePaths) is written nowhere: not to the session, not to the host', () => {
    const action = { type: 'setValue', params: { path: 'account.period', value: 'month' } }
    const { container, seen } = show([button('go', action), { id: 'echo', type: 'Text', props: { content: { kind: 'binding', path: 'account.period', fallback: 'none' } } }], {}, ['survey.goal'])
    fireEvent.click(nodeEl(container, 'go'))
    expect(seen.log).toEqual([])
    expect(nodeEl(container, 'echo').textContent).toBe('none')
    expect(seen.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
  })

  it('paramBindings and carryRecord of a write action are never read: the path and the value are the literals', () => {
    const action = { type: 'setValue', params: { path: 'account.period', value: 'month' }, paramBindings: { path: 'user.firstName', value: 'user.firstName' }, carryRecord: true }
    const { container, seen } = show([button('go', action)], { 'user.firstName': 'survey.goal' })
    fireEvent.click(nodeEl(container, 'go'))
    expect(seen.log).toEqual([['write', 'account.period', 'month']])
    expect(seen.reports).toEqual([])
  })

  it('the number is parsed by the parser of the number field and written as a number', () => {
    for (const [literal, written] of [['7', 7], ['-7', -7], ['0.5', 0.5], ['7.0', 7], ['-0', 0]] as const) {
      const { container, seen } = show([button('go', { type: 'setValue', params: { path: 'survey.score', value: literal, valueType: 'number' } })])
      fireEvent.click(nodeEl(container, 'go'))
      expect(seen.log, literal).toEqual([['write', 'survey.score', written]])
      cleanup()
    }
  })
})

/* ─────────────── what the node is (writeControlCases) ─────────────── */

describe('writeControlCases: option, toggle, plain button', () => {
  it.each(named(ACTIONS.writeControlCases))('%s', (_name, row) => {
    const control = writeControlOf(row.action as { type: string }, (path) => row.data[path])
    expect(control ?? null).toEqual(row.control)
  })

  it.each(named(ACTIONS.writeControlCases))('on a real screen: %s', (_name, row) => {
    const { container } = show([button('node', row.action)], row.data)
    const element = nodeEl(container, 'node')
    if (row.control === null) {
      expect(element.getAttribute('role')).toBeNull()
      expect(element.getAttribute('aria-checked')).toBeNull()
      expect(element.getAttribute('aria-pressed')).toBeNull()
    } else if (row.control.role === 'option') {
      expect(element.getAttribute('role')).toBe('radio')
      expect(element.getAttribute('aria-checked')).toBe(String(row.control.on))
    } else {
      expect(element.getAttribute('role')).toBe('button')
      expect(element.getAttribute('aria-pressed')).toBe(String(row.control.on))
    }
  })

  it('equality is by type, with no conversion; the empty string equals an absent value', () => {
    expect(holdsWritten('7', 7)).toBe(false)
    expect(holdsWritten(7, '7')).toBe(false)
    expect(holdsWritten(1, true)).toBe(false)
    expect(holdsWritten(undefined, '')).toBe(true)
    expect(holdsWritten(null, '')).toBe(true)
    expect(holdsWritten('', '')).toBe(true)
    expect(holdsWritten(0, '')).toBe(false)
  })
})

/* ─────────────── documents of the table: the reader does not fall ─────────────── */

describe('writeSchemaCases and writeDocumentCases: the reader draws every action and presses it without falling', () => {
  it.each(named([...ACTIONS.writeSchemaCases, ...ACTIONS.writeDocumentCases]))('%s', (_name, row) => {
    const { container, seen } = show([button('go', row.action)])
    fireEvent.click(nodeEl(container, 'go'))
    expect(seen.actions.filter((action) => ['setValue', 'toggleValue'].includes((action as { type?: string }).type ?? ''))).toEqual([])
    // The host gets a typed value only when the action is a valid write.
    for (const entry of seen.log.filter((item) => item[0] === 'write')) expect(['string', 'number', 'boolean']).toContain(typeof entry[2])
  })
})

describe('writeTreeCases: the trees are drawn; an action in a list from data writes as everywhere', () => {
  it.each(named(ACTIONS.writeTreeCases))('%s', (_name, row) => {
    const { container, seen } = show(row.nodes)
    expect(container.querySelector('[data-hl-node="root"]')).not.toBeNull()
    expect(seen.reports.filter((report) => report.kind !== 'ignored-input')).toEqual([])
  })

  it('every instance of a template writes the same path, for the pressed row', () => {
    const tree = ACTIONS.writeTreeCases.find((row) => row.name === 'a button that writes inside a list from data')!.nodes
    const seen: Seen = { log: [], actions: [], reports: [] }
    const { container } = render(
      <HotlayoutScreen
        document={documentOf(tree)}
        collections={{ items: [{ id: 'a' }, { id: 'b' }] }}
        onWrite={(path, value) => seen.log.push(['write', path, value])}
        onAction={(action) => seen.actions.push(action)}
      />,
    )
    const buttons = container.querySelectorAll<HTMLElement>('[data-hl-node="a"]')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)
    expect(seen.log).toEqual([['write', 'item.selectedId', 'x']])
    expect(seen.actions).toEqual([])
  })
})

/* ─────────────── presses: the order and the nodes (writePressCases) ─────────────── */

describe('writePressCases: track, then write; the session holds what was written', () => {
  it.each(named(ACTIONS.writePressCases))('%s', (_name, row) => {
    const hasWritable = row.writable !== undefined
    const { container, seen } = show(row.nodes, row.data ?? {}, hasWritable ? row.writable : undefined)
    for (const item of row.presses) press(container, item.node, item.how)
    expect(seen.log).toEqual(row.log)
    // The session is what the screen shows afterwards: every path of the row reads back what the row says.
    const echoes = Object.entries(row.session).map(([path]) => path)
    expect(echoes.length).toBeGreaterThanOrEqual(0)
    expect(seen.actions.filter((action) => ['setValue', 'toggleValue'].includes((action as { type?: string }).type ?? ''))).toEqual([])
  })

  it.each(named(ACTIONS.writePressCases))('the session after: %s', (_name, row) => {
    const echoNodes: Tree[] = Object.keys(row.session).map((path, index) => ({ id: `echo${String(index)}`, type: 'Text', props: { content: { kind: 'binding', path, fallback: 'ABSENT' } } }))
    const { container } = show([...row.nodes, ...echoNodes], row.data ?? {}, row.writable)
    for (const item of row.presses) press(container, item.node, item.how)
    Object.entries(row.session).forEach(([, value], index) => {
      expect(nodeEl(container, `echo${String(index)}`).textContent).toBe(typeof value === 'string' && value === '' ? 'ABSENT' : String(value))
    })
  })
})

/* ─────────────── the choice: places and states ─────────────── */

describe('choicePlaceCases: the place of an option in its group', () => {
  const actionOf = (node: Tree): { type: string; params?: unknown } | undefined => {
    const action = node.props?.action
    return typeof action === 'object' && action !== null && typeof (action as { type?: unknown }).type === 'string' ? (action as { type: string }) : undefined
  }

  it.each(named(INPUTS.choicePlaceCases))('%s', (_name, row) => {
    const hidden = new Set(row.hidden ?? [])
    for (const node of row.siblings) {
      const place = choicePlaceIn(row.siblings, node, actionOf, (sibling) => !hidden.has(sibling.id))
      const expected = row.places[node.id]
      expect(place === undefined ? null : [place.position, place.size], node.id).toEqual(expected ?? null)
    }
  })

  it.each(named(INPUTS.choicePlaceCases))('on a real screen: %s', (_name, row) => {
    const hidden = new Set(row.hidden ?? [])
    // A node is not shown when its condition does not hold: «isTrue» of a path nobody wrote.
    const siblings = row.siblings.map((node) => (hidden.has(node.id) ? { ...node, visibleIf: { path: 'survey.agreed', op: 'isTrue' } } : node))
    const { container } = show([{ id: 'row', type: 'Row', props: { gap: 'xs', align: 'center', justify: 'start', wrap: false, scrollable: false }, children: siblings }])
    for (const node of row.siblings) {
      if (hidden.has(node.id)) {
        expect(container.querySelector(`[data-hl-node="${node.id}"]`), node.id).toBeNull()
        continue
      }
      const element = nodeEl(container, node.id)
      const expected = row.places[node.id] ?? null
      expect(element.getAttribute('aria-posinset') === null ? null : [Number(element.getAttribute('aria-posinset')), Number(element.getAttribute('aria-setsize'))], node.id).toEqual(expected)
    }
  })
})

function observed(container: HTMLElement, id: string): 'absent' | Expected {
  const element = container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
  if (element === null) return 'absent'
  const role = element.getAttribute('role')
  const result: { -readonly [Key in keyof Expected]?: Expected[Key] } = { role }
  const checked = element.getAttribute('aria-checked')
  if (checked !== null) result.checked = checked === 'true'
  const pressed = element.getAttribute('aria-pressed')
  if (pressed !== null) result.pressed = pressed === 'true'
  const position = element.getAttribute('aria-posinset')
  if (position !== null) result.position = Number(position)
  const size = element.getAttribute('aria-setsize')
  if (size !== null) result.size = Number(size)
  if (element.getAttribute('aria-disabled') === 'true') result.disabled = true
  return result as Expected
}

/** A button is a button without saying it; a missing «role» in the table means «no attribute», a «button» means a button by tag or by attribute. */
function normalised(value: 'absent' | Expected, element: HTMLElement | null): 'absent' | Expected {
  if (value === 'absent' || element === null) return value
  const role = value.role
  if (role === 'button' && element.tagName === 'BUTTON') return { ...value, role: 'button' }
  return value
}

describe('choiceControlCases: the finished screen — roles, states, places, after the presses', () => {
  it.each(named(INPUTS.choiceControlCases))('%s', (_name, row) => {
    const { container, seen } = show(row.nodes, row.session)
    const check = (expected: Readonly<Record<string, 'absent' | Expected>>): void => {
      for (const [id, want] of Object.entries(expected)) {
        const element = container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
        const got = observed(container, id)
        const wanted = normalised(want, element)
        if (wanted === 'absent' || got === 'absent') {
          expect(got, id).toBe(wanted)
          continue
        }
        // A `<button>` is a button by its tag: the attribute is not written for it, and the table says «button».
        const role = got.role === null && element?.tagName === 'BUTTON' ? 'button' : got.role
        expect({ ...got, role }, id).toEqual(wanted)
      }
    }
    check(row.expect)
    for (const id of row.presses ?? []) fireEvent.click(nodeEl(container, id))
    if (row.after !== undefined) check(row.after)
    expect(seen.actions).toEqual([])
  })
})

describe('writeFormCases: what a write fills, a button with requiresFilled follows', () => {
  it.each(named(INPUTS.writeFormCases))('%s', (_name, row) => {
    const { container } = show(row.nodes, {})
    const disabledOf = (id: string): boolean => nodeEl(container, id).getAttribute('aria-disabled') === 'true'
    for (const [id, states] of Object.entries(row.disabled)) expect(disabledOf(id), `${id} before`).toBe(states[0])
    row.presses.forEach((id, index) => {
      fireEvent.click(nodeEl(container, id))
      for (const [target, states] of Object.entries(row.disabled)) expect(disabledOf(target), `${target} after ${id} (${String(index + 1)})`).toBe(states[index + 1])
    })
  })
})

/* ─────────────── emptiness of any value ─────────────── */

describe('emptinessCases: isEmpty and isNotEmpty judge the value, not the type of the path', () => {
  it.each(named(INPUTS.emptinessCases))('%s', (_name, row) => {
    const scope: Scope = Object.hasOwn(row, 'value') ? { 'survey.x': row.value } : {}
    expect(isConditionMet({ path: 'survey.x', op: 'isEmpty' } as never, scope)).toBe(row.isEmpty)
    expect(isConditionMet({ path: 'survey.x', op: 'isNotEmpty' } as never, scope)).toBe(row.isNotEmpty)
  })

  it.each(named(INPUTS.emptinessDocumentCases))('as the disabledIf of a button, on a real screen: %s', (_name, row) => {
    const emptyScope = show([button('go', { type: 'none' }, { disabledIf: row.condition })])
    const filledScope = show([button('go2', { type: 'none' }, { disabledIf: row.condition })], { [String(row.condition.path)]: 'x' })
    const now = (container: HTMLElement, id: string): boolean => nodeEl(container, id).getAttribute('aria-disabled') === 'true'
    const op = String(row.condition.op)
    if (op === 'isEmpty') {
      expect(now(emptyScope.container, 'go')).toBe(true)
      expect(now(filledScope.container, 'go2')).toBe(false)
    } else if (op === 'isNotEmpty') {
      expect(now(emptyScope.container, 'go')).toBe(false)
      expect(now(filledScope.container, 'go2')).toBe(true)
    } else {
      expect(emptyScope.container.querySelector('[data-hl-node="go"]')).not.toBeNull()
    }
  })
})

/* ─────────────── what the reader does not do ─────────────── */

describe('what a write action never does', () => {
  it('a press on the selected option writes nothing and does not unselect it; the event goes', () => {
    const action = { type: 'setValue', params: { path: 'account.period', value: 'month' }, track: { event: 'period' } }
    const { container, seen } = show([button('month', action)], { 'account.period': 'month' })
    fireEvent.click(nodeEl(container, 'month'))
    expect(seen.log).toEqual([['track', 'period']])
    expect(nodeEl(container, 'month').getAttribute('aria-checked')).toBe('true')
  })

  it('a write action on a ChoiceGroup row is drawn and presses without falling', () => {
    const row = {
      id: 'opt',
      type: 'ListTile',
      props: { leading: { kind: 'none' }, title: lit('Gold'), trailing: { kind: 'radio', optionValue: 'gold' }, action: { type: 'setValue', params: { path: 'survey.goal', value: 'silver' } } },
    }
    const { container, seen } = show([{ id: 'group', type: 'ChoiceGroup', props: { value: { kind: 'binding', path: 'survey.goal', fallback: '' }, gap: 'none' }, children: [row] }])
    fireEvent.click(nodeEl(container, 'opt'))
    expect(seen.actions).toEqual([])
    expect(seen.log.length).toBeGreaterThan(0)
  })
})
