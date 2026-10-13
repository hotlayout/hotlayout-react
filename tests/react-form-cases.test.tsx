/**
 * FORM CASE TABLE THROUGH THE `@hotlayout/react` PACKAGE: the new groups of
 * `contract/fixtures/inputs/input-cases.json` (schema 9.14.0): a "required" field, a disabled
 * button, a numeric field, writing a group choice into the session.
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`form-rules.ts`, `input-rules.ts`), and this table keeps the two copies together. Each group runs
 * through the package function and, where a row is about behaviour, through a REAL screen
 * (`HotlayoutScreen` / `ScreenView`). NO ROWS ARE SKIPPED: all 300 pass.
 *
 * After that comes one named test for each of the fourteen policy rows of 9.14.0, untrusted input,
 * server render and the `survey-screens.json` fixture walked through "empty → choice → next → name
 * → 12a → 12 → next → consent".
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument, UiNode } from '../src/index'
import { choiceWriteOf, FORM_RULES, isFilledValue, isFormFilled, pressDisabledOf, REQUIRED_MARK } from '../src/form-rules'
import type { FilledKind } from '../src/form-rules'
import { effectiveKeyboardOf, effectiveLinesOf, INITIAL_TEXT_INPUT, INPUT_KEYBOARD_WEB, inputContentDirectionOf } from '../src/input-rules'
import { numberInputText, numberInputInvalid, parseInputNumber, readInputNumber, shownNumberInput, stepNumberInput } from '../src/input-number'
import type { TextInputEvent, TextInputState } from '../src/input-rules'
import { mergeLayers } from '../src/record-scope'
import type { DataLayers } from '../src/record-scope'
import { ScreenView } from '../src/render'
import { resolveTheme } from '../src/theme-resolve'
import { READER_SCHEMA_VERSION } from '../src/version'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* ───────────────────────────── table ───────────────────────────── */

type Layers = DataLayers & { readonly host?: Record<string, unknown> }
type NumberStep = TextInputEvent | { readonly type: 'data'; readonly bound: unknown }

interface NumberFieldCase {
  readonly name: string
  readonly bound: unknown
  readonly maxLength?: number
  readonly disabled?: boolean
  readonly hasPath?: boolean
  readonly steps: readonly NumberStep[]
  readonly writes: readonly (number | '')[]
  readonly shown: string
}
interface FormCase {
  readonly name: string
  readonly screens: Readonly<Record<string, readonly UiNode[]>>
  readonly states: readonly { readonly name: string; readonly layers: Layers; readonly filled: Readonly<Record<string, boolean>>; readonly disabled?: Readonly<Record<string, boolean>> }[]
}
interface PressCase {
  readonly name: string
  readonly disabled: boolean
  readonly widget?: 'IconButton'
  readonly press: 'tap' | 'double-tap' | 'enter' | 'space' | 'enter-held'
  readonly action: number
  readonly track: number
}
interface LookCase {
  readonly name: string
  readonly disabled: boolean
  readonly widget?: 'IconButton'
  readonly variant?: string
  readonly styleOpacity?: number
  readonly opacity: number
  readonly semantics: { readonly disabled: boolean; readonly focusable: boolean }
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/inputs/input-cases.json', 'utf8')) as {
  readonly numberParseCases: readonly { readonly text: string; readonly number: number | null }[]
  readonly numberReadCases: readonly { readonly name: string; readonly value?: unknown; readonly number: number | null; readonly text: string }[]
  readonly numberFieldCases: readonly NumberFieldCase[]
  readonly numberKeyboardCases: readonly {
    readonly name: string
    readonly valueType?: unknown
    readonly given?: { readonly keyboard?: unknown; readonly lines?: unknown }
    readonly keyboard: string
    readonly lines: number
    readonly content: 'screen' | 'left-to-right'
    readonly web?: { readonly type: string; readonly inputmode: string }
  }[]
  readonly filledCases: readonly { readonly name: string; readonly kind: FilledKind; readonly value?: unknown; readonly filled: boolean }[]
  readonly formCases: readonly FormCase[]
  readonly pressCases: readonly PressCase[]
  readonly disabledLookCases: readonly LookCase[]
  readonly choiceCases: readonly { readonly name: string; readonly value: unknown; readonly shown: string; readonly pick: string; readonly write: { readonly path: string; readonly value: string } | null }[]
  readonly choiceSessionCases: readonly {
    readonly name: string
    readonly value: { readonly kind: 'binding'; readonly path: string } | { readonly kind: 'literal'; readonly value: string }
    readonly pickFirst?: string
    readonly pick: string
    readonly condition: Record<string, unknown>
    readonly before: boolean
    readonly after: boolean
  }[]
  readonly formDocumentCases: readonly { readonly name: string; readonly node: UiNode; readonly valid: boolean; readonly code?: string }[]
  readonly formRuleCases: readonly { readonly at: string; readonly expect: unknown }[]
}
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as {
  readonly 'x-style': { readonly layout: { readonly form: Record<string, unknown> } }
  readonly 'x-compatibility': { readonly policy: Record<string, string>; readonly features: Record<string, string> }
}
const FIXTURE = JSON.parse(readFileSync('contract/fixtures/survey-screens.json', 'utf8')) as UiDocument

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)

/* ───────────────────────────── nodes and screens ───────────────────────────── */

const lit = (value: string): { kind: 'literal'; value: string } => ({ kind: 'literal', value })
const bind = (path: string): { kind: 'binding'; path: string } => ({ kind: 'binding', path })
const quiet = (): void => undefined
const THEME = resolveTheme(undefined).theme

const screenRoot = (children: readonly UiNode[], id = 'root'): UiNode => ({ id, type: 'Screen', props: {}, children })
const documentOf = (children: readonly UiNode[], extra: Record<string, unknown> = {}): UiDocument =>
  ({
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'form-test',
    name: 'form',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: screenRoot(children) }],
    ...extra,
  })

const numberField = (props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode =>
  ({ id: 'f', type: 'TextField', props: { label: lit('Age'), value: bind('survey.age'), valueType: 'number', ...props }, ...extra })
const textField = (props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode =>
  ({ id: 'f', type: 'TextField', props: { label: lit('Name'), value: bind('survey.name'), ...props }, ...extra })
const nextButton = (props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode =>
  ({ id: 'next', type: 'Button', props: { label: lit('Next'), variant: 'primary', fullWidth: true, action: { type: 'app.next' }, ...props }, ...extra })

interface Run {
  readonly writes: [string, string | boolean | number][]
  readonly actions: string[]
  readonly tracks: string[]
  readonly reports: HotlayoutReport[]
}
const newRun = (): Run => ({ writes: [], actions: [], tracks: [], reports: [] })

function show(children: readonly UiNode[], run: Run, props: Record<string, unknown> = {}, documentExtra: Record<string, unknown> = {}) {
  const element = (next: Record<string, unknown>) => (
    <HotlayoutScreen
      document={documentOf(children, documentExtra)}
      onWrite={(path, value) => void run.writes.push([path, value])}
      onAction={(action) => void run.actions.push(action.type)}
      onTrack={(event) => void run.tracks.push(event.event)}
      onReport={(report) => void run.reports.push(report)}
      {...props}
      {...next}
    />
  )
  const view = render(element({}))
  return {
    ...view,
    again: (next: Record<string, unknown>): void => {
      view.rerender(element(next))
    },
  }
}

const nodeEl = (container: ParentNode, id: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
  if (found === null) throw new Error(`node ${id} is not on the screen`)
  return found
}
const textbox = (container: HTMLElement): HTMLInputElement => {
  const found = container.querySelector<HTMLInputElement>('input')
  if (found === null) throw new Error('there is no field')
  return found
}
const isDisabled = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') === 'true'
const type = (el: HTMLInputElement, value: string): void => {
  fireEvent.change(el, { target: { value } })
}
const focus = (el: HTMLElement): void => {
  act(() => {
    el.focus()
  })
}

/** Layer values as the screen `data`: the host scope and data are one layer in the package (the host gives both through the `data` prop). */
const hostData = (layers: Layers): Record<string, unknown> => ({ ...mergeLayers({ host: layers.host, data: layers.data }) })

/** A function over the screen root node of a table row. */
const rootOf = (id: string, children: readonly UiNode[]): UiNode => screenRoot(children, `${id}-root`)

function nodesOf(root: UiNode, out: UiNode[] = []): UiNode[] {
  out.push(root)
  for (const child of root.children ?? []) nodesOf(child, out)
  return out
}

/* ───────────────────────────── table: groups ───────────────────────────── */

describe('table: the new groups are named and not empty', () => {
  it('every 9.14.0 group has rows, 304 in total', () => {
    const groups = ['numberParseCases', 'numberReadCases', 'numberFieldCases', 'numberKeyboardCases', 'filledCases', 'pressCases', 'disabledLookCases', 'choiceCases', 'choiceSessionCases', 'formDocumentCases', 'formRuleCases'] as const
    for (const group of groups) expect(TABLE[group].length, group).toBeGreaterThan(3)
    const states = TABLE.formCases.reduce((sum, row) => sum + row.states.length, 0)
    expect(states).toBe(68)
    expect(TABLE.numberParseCases.length + TABLE.numberReadCases.length + TABLE.numberFieldCases.length + TABLE.numberKeyboardCases.length + TABLE.filledCases.length + TABLE.formCases.length + TABLE.pressCases.length + TABLE.disabledLookCases.length + TABLE.choiceCases.length + TABLE.choiceSessionCases.length + TABLE.formDocumentCases.length + TABLE.formRuleCases.length).toBe(304)
  })
})

describe('parsing typed text into a number', () => {
  it.each(TABLE.numberParseCases.map((row, index) => [index, JSON.stringify(row.text), row] as const))('#%i %s', (_index, _text, row) => {
    expect(parseInputNumber(row.text) ?? null).toBe(row.number)
  })

  it('minus zero is written as zero, not -0', () => {
    expect(Object.is(parseInputNumber('-0'), 0)).toBe(true)
    expect(Object.is(parseInputNumber('-0.0'), 0)).toBe(true)
  })

  it('the platform parser is not the rule here: Number() accepts what the table does not', () => {
    for (const text of ['1e5', '0x10', 'Infinity', '', '   ', '+5']) {
      expect(Number.isNaN(Number(text)), text).toBe(false)
      expect(parseInputNumber(text), text).toBeUndefined()
    }
  })

  it('a single pass: a long hostile string is parsed instantly', () => {
    const started = Date.now()
    expect(parseInputNumber('1'.repeat(100_000) + 'x')).toBeUndefined()
    expect(parseInputNumber('9'.repeat(5_000_000))).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('what a numeric field reads from the layers and shows for a number from data', () => {
  it.each(named(TABLE.numberReadCases))('%s', (_name, row) => {
    expect(readInputNumber(row.value) ?? null).toBe(row.number)
    expect(numberInputText(row.value)).toBe(row.text)
  })
})

/* ───────────────────────────── numeric field ───────────────────────────── */

function driveNumber(row: NumberFieldCase): { writes: (number | '')[]; shown: string } {
  let state: TextInputState = INITIAL_TEXT_INPUT
  let bound = row.bound
  const writes: (number | '')[] = []
  const options = { maxLength: row.maxLength, ...(row.disabled === undefined ? {} : { disabled: row.disabled }), ...(row.hasPath === undefined ? {} : { hasPath: row.hasPath }) }
  for (const step of row.steps) {
    if (step.type === 'data') {
      bound = step.bound
      continue
    }
    const result = stepNumberInput(state, step, bound, options)
    state = result.state
    if (result.write !== undefined) writes.push(result.write)
  }
  return { writes, shown: shownNumberInput(state, bound) }
}

describe('numeric field: what is written and what is shown', () => {
  it.each(named(TABLE.numberFieldCases))('function: %s', (_name, row) => {
    const result = driveNumber(row)
    expect(result.writes).toEqual(row.writes)
    expect(result.shown).toBe(row.shown)
  })

  it.each(named(TABLE.numberFieldCases))('real screen: %s', (_name, row) => {
    const run = newRun()
    const disabledIf = row.disabled === true ? { path: 'off', op: 'isTrue' } : undefined
    const node = numberField({
      ...(row.hasPath === false ? { value: lit('x') } : {}),
      ...(row.maxLength === undefined ? {} : { maxLength: row.maxLength }),
      ...(disabledIf === undefined ? {} : { disabledIf }),
    })
    const dataFor = (bound: unknown): Record<string, unknown> => ({ ...(disabledIf === undefined ? {} : { off: true }), ...(bound === null || bound === undefined ? {} : { 'survey.age': bound }) })
    const draw = (bound: unknown) => (
      <HotlayoutScreen document={documentOf([node])} data={dataFor(bound)} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />
    )
    const view = render(draw(row.bound))
    const el = textbox(view.container)
    for (const step of row.steps) {
      switch (step.type) {
        case 'focus':
          focus(el)
          break
        case 'blur':
          act(() => {
            el.blur()
          })
          break
        case 'input':
        case 'platformFill':
          type(el, step.text)
          break
        case 'compositionStart':
          fireEvent.compositionStart(el)
          break
        case 'compositionEnd':
          fireEvent.compositionEnd(el, { target: { value: step.text } })
          break
        case 'data':
          view.rerender(draw(step.bound))
          break
      }
    }
    expect(run.writes.map(([, value]) => value)).toEqual([...row.writes])
    if (row.hasPath !== false) for (const [path] of run.writes) expect(path).toBe('survey.age')
    expect(textbox(view.container).value).toBe(row.shown)
  })

  it('a number goes to the host as a NUMBER, not a string; an erased one as an empty string, not null', () => {
    const run = newRun()
    const view = show([numberField()], run)
    const el = textbox(view.container)
    focus(el)
    type(el, '12')
    type(el, '')
    expect(run.writes).toEqual([
      ['survey.age', 12],
      ['survey.age', ''],
    ])
    expect(typeof run.writes[0]?.[1]).toBe('number')
  })
})

describe('keyboard and rows of the numeric field', () => {
  it.each(named(TABLE.numberKeyboardCases))('function: %s', (_name, row) => {
    expect(effectiveKeyboardOf(row.given?.keyboard, row.given?.lines, row.valueType)).toBe(row.keyboard)
    expect(effectiveLinesOf(row.given?.lines, row.valueType)).toBe(row.lines)
    expect(inputContentDirectionOf(row.given?.keyboard, row.given?.lines, row.valueType)).toBe(row.content)
    const keyboard = effectiveKeyboardOf(row.given?.keyboard, row.given?.lines, row.valueType)
    if (row.web !== undefined && keyboard !== 'multiline') expect(INPUT_KEYBOARD_WEB[keyboard]).toMatchObject(row.web)
  })

  it.each(named(TABLE.numberKeyboardCases))('real screen: %s', (_name, row) => {
    const node = textField({
      ...(row.valueType === undefined ? {} : { valueType: row.valueType }),
      ...(row.given?.keyboard === undefined ? {} : { keyboard: row.given.keyboard }),
      ...(row.given?.lines === undefined ? {} : { lines: row.given.lines }),
    })
    const view = show([node], newRun())
    const control = view.container.querySelector<HTMLElement>('input, textarea')
    if (control === null) throw new Error('there is no field')
    // Row count: single-line is `<input>`, multi-line is `<textarea rows>`.
    if (row.lines === 1) expect(control.tagName).toBe('INPUT')
    else expect(control.getAttribute('rows')).toBe(String(row.lines))
    expect(control.getAttribute('dir')).toBe(row.content === 'left-to-right' ? 'ltr' : null)
    if (row.web !== undefined) {
      expect(control.getAttribute('type')).toBe(row.web.type)
      expect(control.getAttribute('inputmode')).toBe(row.web.inputmode)
    }
  })
})

/* ───────────────────────────── "filled" ───────────────────────────── */

describe('"filled"', () => {
  it.each(TABLE.filledCases.map((row) => [`${row.kind}: ${row.name}`, row] as const))('%s', (_name, row) => {
    expect(isFilledValue(row.kind, row.value)).toBe(row.filled)
  })
})

/* ───────────────────────────── screen form ───────────────────────────── */

describe('screen form: whether it is filled and whether the button is disabled', () => {
  const cases = TABLE.formCases.flatMap((row) => row.states.map((state) => [`${row.name} — ${state.name}`, row, state] as const))

  it.each(cases)('function: %s', (_name, row, state) => {
    const scope = mergeLayers(state.layers)
    const roots = Object.fromEntries(Object.entries(row.screens).map(([id, children]) => [id, rootOf(id, children)]))
    for (const [id, expected] of Object.entries(state.filled)) expect(isFormFilled(roots[id]!, scope), `screen form ${id}`).toBe(expected)
    for (const [nodeId, expected] of Object.entries(state.disabled ?? {})) {
      const home = Object.values(roots).find((root) => nodesOf(root).some((node) => node.id === nodeId))
      if (home === undefined) throw new Error(`node ${nodeId} is not in the row`)
      const node = nodesOf(home).find((entry) => entry.id === nodeId)!
      expect(pressDisabledOf(node, scope, () => isFormFilled(home, scope)), `node ${nodeId}`).toBe(expected)
    }
  })

  it.each(cases)('real screen: %s', (_name, row, state) => {
    // Each row screen is a separate `ScreenView`: record, session and host data are its layers.
    for (const [id, children] of Object.entries(row.screens)) {
      cleanup()
      const root = rootOf(id, children)
      const known = Object.keys(state.disabled ?? {}).filter((nodeId) => nodesOf(root).some((node) => node.id === nodeId))
      if (known.length === 0) continue
      const view = render(
        <ScreenView screenId={id} root={root} theme={THEME} data={hostData(state.layers)} record={state.layers.record} session={state.layers.session} onIssue={quiet} />,
      )
      for (const nodeId of known) {
        const el = view.container.querySelector<HTMLElement>(`[data-hl-node="${nodeId}"]`)
        // The node is not on the screen (hidden by a condition): there is nothing to disable; the table expectation is about a drawn node.
        if (el === null) continue
        expect(isDisabled(el), `node ${nodeId} of screen ${id}`).toBe(state.disabled![nodeId])
      }
    }
  })
})

/* ───────────────────────────── disabled button ───────────────────────────── */

/** A table row button: disabled by a condition on a path that is absent from the data (`isEmpty` without a value is met). */
function pressTarget(row: { disabled: boolean; widget?: 'IconButton'; variant?: string; styleOpacity?: number }): UiNode {
  const disabledIf = row.disabled ? { disabledIf: { path: 'survey.name', op: 'isEmpty' } } : {}
  const action = { type: 'app.next', track: { event: 'next_pressed' } }
  const style = row.styleOpacity === undefined ? {} : { style: { opacity: row.styleOpacity } }
  if (row.widget === 'IconButton') return { id: 'target', type: 'IconButton', props: { icon: 'check', label: lit('Done'), variant: 'ghost', size: 'md', action, ...disabledIf }, ...style }
  return { id: 'target', type: 'Button', props: { label: lit('Next'), variant: row.variant ?? 'primary', action, fullWidth: true, ...disabledIf }, ...style }
}

/** What a key does in a browser on a real button: Enter clicks on keydown, Space on keyup; `preventDefault` cancels that. */
function browserKey(target: HTMLElement, key: string, repeat = false): void {
  const prevented = !fireEvent.keyDown(target, { key, repeat })
  if (key === 'Enter' && !prevented) fireEvent.click(target)
  if (key === ' ') {
    const upPrevented = !fireEvent.keyUp(target, { key })
    if (!prevented && !upPrevented && !repeat) fireEvent.click(target)
  }
}

describe('pressing a disabled button, on a real screen', () => {
  it.each(named(TABLE.pressCases))('%s', (_name, row) => {
    const run = newRun()
    const target = pressTarget(row)
    const children: UiNode[] = row.widget === 'IconButton' ? [{ id: 'bar', type: 'AppBar', props: { title: lit('Title'), showBack: false }, children: [target] }] : [target]
    const view = show(children, run)
    const el = nodeEl(view.container, 'target')
    if (row.press === 'tap') fireEvent.click(el)
    if (row.press === 'double-tap') {
      fireEvent.click(el)
      fireEvent.click(el)
    }
    if (row.press === 'enter') browserKey(el, 'Enter')
    if (row.press === 'space') browserKey(el, ' ')
    if (row.press === 'enter-held') {
      browserKey(el, 'Enter')
      browserKey(el, 'Enter', true)
      browserKey(el, 'Enter', true)
    }
    // A press that reached the host is both the action and its analytics event: they travel together.
    expect(run.actions).toHaveLength(row.action)
    expect(run.tracks).toHaveLength(row.track)
  })

  it('a disabled button cannot be pressed with real keyboard events either (user-event)', async () => {
    const user = userEvent.setup()
    const run = newRun()
    const view = show([pressTarget({ disabled: true })], run)
    const el = nodeEl(view.container, 'target')
    await user.click(el)
    el.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(run.actions).toEqual([])
    expect(run.tracks).toEqual([])
  })
})

describe('look and semantics of a disabled button, on a real screen', () => {
  it.each(named(TABLE.disabledLookCases))('%s', (_name, row) => {
    const view = show([pressTarget(row)], newRun())
    const el = nodeEl(view.container, 'target')
    expect(Number(el.style.opacity === '' ? '1' : el.style.opacity)).toBeCloseTo(row.opacity, 6)
    // The button stays a real button in the focus order; unavailability is stated by `aria-disabled`, not by the `disabled` attribute.
    expect(el.tagName).toBe('BUTTON')
    expect(el.getAttribute('aria-disabled')).toBe(row.semantics.disabled ? 'true' : null)
    expect(el.hasAttribute('disabled')).toBe(false)
    expect(el.tabIndex === 0).toBe(row.semantics.focusable)

    // The theme role does not change: the background, label and border are the same as for an enabled button.
    cleanup()
    const enabled = show([pressTarget({ ...row, disabled: false })], newRun())
    const reference = nodeEl(enabled.container, 'target')
    expect(el.style.backgroundColor).toBe(reference.style.backgroundColor)
    expect(el.style.color).toBe(reference.style.color)
    expect(el.style.border).toBe(reference.style.border)
    expect(el.style.padding).toBe(reference.style.padding)
  })

  it('a button in the focus order: Tab reaches a disabled one and stops on it', async () => {
    const user = userEvent.setup()
    const view = show([pressTarget({ disabled: true })], newRun())
    await user.tab()
    expect(document.activeElement).toBe(nodeEl(view.container, 'target'))
  })
})

/* ───────────────────────────── group choice ───────────────────────────── */

describe('group choice: what is written and where', () => {
  it.each(named(TABLE.choiceCases))('%s', (_name, row) => {
    expect(choiceWriteOf(row.value, row.pick, row.shown) ?? null).toEqual(row.write)
  })
})

describe('a group choice is immediately visible to conditions of the same screen, on a real screen', () => {
  const option = (value: string): UiNode => ({ id: `opt-${value}`, type: 'ListTile', props: { leading: { kind: 'none' }, title: lit(value), trailing: { kind: 'radio', optionValue: value } } })

  it.each(named(TABLE.choiceSessionCases))('%s', (_name, row) => {
    const run = newRun()
    const group = { id: 'group', type: 'ChoiceGroup', props: { value: row.value, gap: 'none' }, children: [option('gold'), option('silver'), option('curious')] } as UiNode
    // A button that is disabled until a condition is met: it enables as soon as the choice meets it. The host RETURNS NO VALUES.
    const view = show([group, nextButton({ disabledIf: row.condition })], run)
    const disabled = (): boolean => isDisabled(nodeEl(view.container, 'next'))
    expect(disabled()).toBe(row.before)
    const picks = row.pickFirst === undefined ? [row.pick] : [row.pickFirst, row.pick]
    for (const pick of picks) fireEvent.click(nodeEl(view.container, `opt-${pick}`))
    expect(disabled()).toBe(row.after)
    expect(run.writes).toEqual(row.value.kind === 'binding' ? picks.map((pick) => [row.value.kind === 'binding' ? row.value.path : '', pick]) : [])
  })

  it('the same option a second time writes nothing', () => {
    const run = newRun()
    const group = { id: 'group', type: 'ChoiceGroup', props: { value: bind('survey.goal') }, children: [option('gold')] } as UiNode
    const view = show([group], run)
    fireEvent.click(nodeEl(view.container, 'opt-gold'))
    fireEvent.click(nodeEl(view.container, 'opt-gold'))
    expect(run.writes).toEqual([['survey.goal', 'gold']])
  })

  it('writablePaths applies to a choice just as to a field: a foreign path gives a report and neither a write nor a session change', () => {
    const run = newRun()
    const group = { id: 'group', type: 'ChoiceGroup', props: { value: bind('survey.goal') }, children: [option('gold')] } as UiNode
    const view = show([group, nextButton({ disabledIf: { path: 'survey.goal', op: 'isEmpty' } })], run, { writablePaths: ['survey.other'] })
    fireEvent.click(nodeEl(view.container, 'opt-gold'))
    expect(run.writes).toEqual([])
    expect(run.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(true)
  })
})

/* ───────────────────────────── documents ───────────────────────────── */

describe('documents: the reader does not crash and reads only the literal true', () => {
  it.each(named(TABLE.formDocumentCases))('%s', (_name, row) => {
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentOf([row.node])} onReport={(report) => void reports.push(report)} />)
    expect(view.container.querySelector(`[data-hl-node="${row.node.id}"]`)).not.toBeNull()
    // An asterisk and `aria-required` come only from the literal `true` on a widget that has this field.
    const props = row.node.props as Record<string, unknown>
    const mayBeRequired = ['TextField', 'Checkbox', 'ChoiceGroup'].includes(row.node.type)
    const marks = view.container.querySelectorAll('[data-hl-required]').length
    const aria = view.container.querySelectorAll('[aria-required="true"]').length
    expect(aria > 0).toBe(mayBeRequired && props.required === true)
    expect(marks > 0).toBe(mayBeRequired && props.required === true && row.node.type !== 'ChoiceGroup')
    // Disabled comes only from the literal `true` / a condition on a button; a list row is not disabled whatever is set.
    const el = view.container.querySelector<HTMLElement>(`[data-hl-node="${row.node.id}"]`)!
    if (!['Button', 'IconButton'].includes(row.node.type)) expect(el.getAttribute('aria-disabled')).toBeNull()
  })
})

/* ───────────────── numeric field with a non-number: error state ───────────────── */

interface NumberInvalidCase {
  readonly name: string
  readonly bound: unknown
  readonly disabled?: boolean
  readonly steps: readonly ({ readonly type: 'focus' } | { readonly type: 'blur' } | { readonly type: 'input'; readonly text: string } | { readonly type: 'data'; readonly bound: unknown })[]
  readonly states: readonly boolean[]
}
const INVALID_CASES = (TABLE as unknown as { readonly numberInvalidCases: readonly NumberInvalidCase[] }).numberInvalidCases

describe('numeric field with a non-number: error state', () => {
  it('table: eleven sequences', () => {
    expect(INVALID_CASES).toHaveLength(11)
  })

  it.each(named(INVALID_CASES))('function: %s', (_name, row) => {
    let state: TextInputState = INITIAL_TEXT_INPUT
    let bound = row.bound
    const seen: boolean[] = []
    for (const step of row.steps) {
      if (step.type === 'data') bound = step.bound
      else state = stepNumberInput(state, step, bound, row.disabled === undefined ? {} : { disabled: row.disabled }).state
      seen.push(numberInputInvalid(state, bound))
    }
    expect(seen).toEqual([...row.states])
  })

  it.each(named(INVALID_CASES))('real screen: %s', (_name, row) => {
    const disabledIf = row.disabled === true ? { path: 'off', op: 'isTrue' } : undefined
    const dataFor = (bound: unknown): Record<string, unknown> => ({ ...(disabledIf === undefined ? {} : { off: true }), ...(bound === null || bound === undefined ? {} : { 'survey.age': bound }) })
    const node = numberField(disabledIf === undefined ? {} : { disabledIf })
    const draw = (bound: unknown) => <HotlayoutScreen document={documentOf([node])} data={dataFor(bound)} onWrite={quiet} onReport={quiet} />
    // A look sample: the same field with a non-empty `error` from data, and a field without an error.
    const reference = render(<HotlayoutScreen document={documentOf([numberField({ error: lit('Bad') })])} onReport={quiet} />)
    const errorStyle = textbox(reference.container).getAttribute('style')
    cleanup()
    const plain = render(<HotlayoutScreen document={documentOf([numberField()])} onReport={quiet} />)
    const plainStyle = textbox(plain.container).getAttribute('style')
    cleanup()
    expect(errorStyle).not.toBe(plainStyle)

    const view = render(draw(row.bound))
    const el = textbox(view.container)
    const marks: boolean[] = []
    for (const step of row.steps) {
      if (step.type === 'focus') focus(el)
      else if (step.type === 'blur')
        act(() => {
          el.blur()
        })
      else if (step.type === 'input') type(el, step.text)
      else view.rerender(draw(step.bound))
      const field = textbox(view.container)
      const invalid = field.getAttribute('aria-invalid') === 'true'
      marks.push(invalid)
      // The look is the same as with `error`, or the ordinary one; never a third.
      if (invalid) expect(field.getAttribute('style')).toBe(errorStyle)
      // The reader adds no text: a descriptive link appears only from helper / error.
      expect(field.getAttribute('aria-describedby')).toBeNull()
    }
    expect(marks).toEqual([...row.states])
  })

  it('the hint (helper) stays in place in the non-number state too, and there is no error text', () => {
    const view = show([numberField({ helper: lit('Digits only') })], newRun())
    const el = textbox(view.container)
    focus(el)
    type(el, '12a')
    act(() => {
      el.blur()
    })
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(view.container.textContent).toContain('Digits only')
    expect(el.getAttribute('aria-describedby')).not.toBeNull()
  })

  it('a text field is not bothered by a non-number', () => {
    const view = show([textField()], newRun())
    const el = textbox(view.container)
    focus(el)
    type(el, '12a')
    act(() => {
      el.blur()
    })
    expect(el.getAttribute('aria-invalid')).toBeNull()
  })

  it('SSR: on the server there is no focus or typed text, so a number from data and an empty field show no error, hydration without mismatch', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    for (const data of [{}, { 'survey.age': 7 }, { 'survey.age': '12a' }]) {
      cleanup()
      const element = <HotlayoutScreen document={documentOf([numberField()])} data={data} onReport={quiet} />
      const html = renderToString(element)
      expect(html).not.toContain('aria-invalid')
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.appendChild(host)
      act(() => {
        hydrateRoot(host, element)
      })
      host.remove()
    }
    const mismatch = errors.mock.calls.filter((call) => /hydrat|did not match/i.test(String(call[0])))
    errors.mockRestore()
    expect(mismatch).toEqual([])
  })
})

describe('the rule is artifact data', () => {
  const at = (path: string): unknown => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], FORM_RULES)

  it.each(TABLE.formRuleCases.map((row) => [row.at, row] as const))('%s', (_path, row) => {
    expect(at(row.at)).toEqual(row.expect)
  })

  it('the whole mirror equals the artifact block, key for key', () => {
    expect(JSON.parse(JSON.stringify(FORM_RULES))).toEqual(ARTIFACT['x-style'].layout.form)
  })

  it('three capabilities, since 9.14.0', () => {
    for (const feature of ['inputRequired', 'pressDisabled', 'numberInput']) expect(ARTIFACT['x-compatibility'].features[feature], feature).toBe('9.14.0')
  })

  it('the "required" mark is an asterisk', () => {
    expect(REQUIRED_MARK).toBe(FORM_RULES.required.mark.text)
  })
})

/* ───────────────────── 9.14.0 policy rows, one test each ───────────────────── */

describe('9.14.0 policy rows, one named test each', () => {
  const requiredField = (extra: Record<string, unknown> = {}, id = 'f'): UiNode => ({ ...textField({ required: true, ...extra }), id })
  const toggle = (props: Record<string, unknown> = {}): UiNode => ({ id: 't', type: 'Checkbox', props: { label: lit('Agree'), value: bind('survey.agreed'), ...props } })

  it('unreadableRequired: not the literal true means "not required": no asterisk, no aria-required, no effect on the button', () => {
    for (const bad of ['yes', 1, 'true', false, null, {}]) {
      cleanup()
      const run = newRun()
      const view = show([requiredField({ required: bad }), nextButton({ requiresFilled: true })], run)
      expect(view.container.querySelector('[data-hl-required]'), JSON.stringify(bad)).toBeNull()
      expect(view.container.querySelector('[aria-required]'), JSON.stringify(bad)).toBeNull()
      expect(isDisabled(nodeEl(view.container, 'next')), JSON.stringify(bad)).toBe(false)
    }
    // On a switch and a badge `required` is not read at all.
    cleanup()
    const switchNode = { id: 's', type: 'Switch', props: { label: lit('Push'), value: bind('survey.push'), required: true } } as UiNode
    const view = show([switchNode, nextButton({ requiresFilled: true })], newRun())
    expect(view.container.querySelector('[data-hl-required]')).toBeNull()
    expect(view.container.querySelector('[aria-required]')).toBeNull()
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(false)
  })

  it('requiredHiddenOrDisabled: a field hidden by a condition (own or of an ancestor) and a disabled field do not hold the form', () => {
    const hidden = requiredField({}, 'hidden')
    const view = show(
      [
        { ...hidden, visibleIf: { path: 'show', op: 'isTrue' } },
        { id: 'box', type: 'Column', props: {}, visibleIf: { path: 'show', op: 'isTrue' }, children: [requiredField({ value: bind('survey.inner') }, 'inner')] },
        requiredField({ value: bind('survey.off'), disabledIf: { path: 'off', op: 'isTrue' } }, 'off'),
        nextButton({ requiresFilled: true }),
      ],
      newRun(),
      { data: { show: false, off: true } },
    )
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(false)
  })

  it('requiredWithoutPath: a field without a path is never filled, so the button stays disabled', () => {
    const view = show([requiredField({ value: lit('x') }), nextButton({ requiresFilled: true })], newRun())
    const el = textbox(view.container)
    focus(el)
    type(el, 'abc')
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(true)
  })

  it('requiredInInactiveTab: a field in a tab that is not open counts', () => {
    const tabs = {
      id: 'tabs',
      type: 'Tabs',
      props: {},
      children: [
        { id: 'one', type: 'Tab', props: { title: lit('One') }, children: [] },
        { id: 'two', type: 'Tab', props: { title: lit('Two') }, children: [requiredField({}, 'inside')] },
      ],
    } as unknown as UiNode
    const view = show([tabs, nextButton({ requiresFilled: true })], newRun())
    expect(view.container.querySelector('input')).toBeNull()
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(true)
    view.again({ data: { 'survey.name': 'Alex' } })
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(false)
  })

  it('requiredMessage: no own text, neither before nor after an attempt to press; the field does not turn red', () => {
    const run = newRun()
    const view = show([requiredField(), nextButton({ requiresFilled: true })], run)
    const before = view.container.textContent
    fireEvent.click(nodeEl(view.container, 'next'))
    expect(view.container.textContent).toBe(before)
    expect(textbox(view.container).getAttribute('aria-invalid')).toBeNull()
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
    expect(run.actions).toEqual([])
  })

  it('requiredMessage: the asterisk is hidden from a screen reader, so the accessible name is without it', () => {
    show([requiredField(), toggle({ required: true })], newRun())
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-required')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Agree' }).getAttribute('aria-required')).toBe('true')
    for (const mark of Array.from(document.querySelectorAll('[data-hl-required]'))) {
      expect(mark.getAttribute('aria-hidden')).toBe('true')
      expect(mark.textContent).toBe('*')
    }
  })

  it('unreadableRequiresFilled: not the literal true means the button does not depend on the form', () => {
    for (const bad of ['true', 1, 'yes', false]) {
      cleanup()
      const view = show([requiredField(), nextButton({ requiresFilled: bad })], newRun())
      expect(isDisabled(nodeEl(view.container, 'next')), JSON.stringify(bad)).toBe(false)
    }
  })

  it('requiresFilledWithoutRequired: there are no required fields, so the button is enabled', () => {
    const view = show([textField(), nextButton({ requiresFilled: true })], newRun())
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(false)
  })

  it('disabledPress: a disabled button does nothing; it enables under the finger, with the first letter, without a host reply', () => {
    const run = newRun()
    const view = show([requiredField(), nextButton({ requiresFilled: true, action: { type: 'app.next', track: { event: 'next' } } })], run)
    const next = nodeEl(view.container, 'next')
    fireEvent.click(next)
    expect(run.actions).toEqual([])
    expect(run.tracks).toEqual([])
    const el = textbox(view.container)
    focus(el)
    type(el, 'A')
    expect(isDisabled(next)).toBe(false)
    fireEvent.click(next)
    expect(run.actions).toEqual(['app.next'])
    expect(run.tracks).toEqual(['next'])
    // Erased: disabled again.
    type(el, '')
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(true)
  })

  it('disabledPress: composing a character (IME) does not enable the button until it ends', () => {
    const view = show([requiredField(), nextButton({ requiresFilled: true })], newRun())
    const el = textbox(view.container)
    focus(el)
    fireEvent.compositionStart(el)
    type(el, 'х')
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(true)
    fireEvent.compositionEnd(el, { target: { value: 'хо' } })
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(false)
  })

  it('unknownInputValueType: a valueType other than number (date, 7, null) gives a string field that writes a string', () => {
    for (const valueType of ['date', 7, null, 'string']) {
      cleanup()
      const run = newRun()
      const view = show([numberField({ valueType })], run)
      const el = textbox(view.container)
      focus(el)
      type(el, '12a')
      expect(run.writes, String(valueType)).toEqual([['survey.age', '12a']])
    }
  })

  it('numberInputText: a number is written as a number; "12a" and an erased value as an empty string; the field keeps what was typed', () => {
    const run = newRun()
    const view = show([numberField()], run)
    const el = textbox(view.container)
    focus(el)
    type(el, '1,5')
    type(el, '12a')
    type(el, '')
    expect(run.writes).toEqual([
      ['survey.age', 1.5],
      ['survey.age', ''],
    ])
    type(el, '12a')
    expect(el.value).toBe('12a')
  })

  it('numberInputValueOfOtherType: the string "12" under a number path gives an empty field, not 12', () => {
    const view = show([numberField()], newRun(), { data: { 'survey.age': '12' } })
    expect(textbox(view.container).value).toBe('')
  })

  it('numberInputValueOfOtherType: a number from data is shown canonically: a dot, no groups, no locale', () => {
    const view = show([numberField()], newRun(), { data: { 'survey.age': 1850.5 }, locale: 'es' })
    expect(textbox(view.container).value).toBe('1850.5')
  })

  it('numberInputOptions: a numeric field does not read keyboard and lines: one row, inputmode decimal, left to right', () => {
    const view = show([numberField({ keyboard: 'email', lines: 4 })], newRun())
    const el = textbox(view.container)
    expect(view.container.querySelector('textarea')).toBeNull()
    expect(el.getAttribute('inputmode')).toBe('decimal')
    expect(el.getAttribute('dir')).toBe('ltr')
  })

  it('choiceWrite: a choice is written to the session and to the host, and a button with requiresFilled enables without a host reply', () => {
    const run = newRun()
    const group = {
      id: 'g',
      type: 'ChoiceGroup',
      props: { value: { kind: 'binding', path: 'survey.goal', fallback: '' }, required: true },
      children: [{ id: 'o', type: 'ListTile', props: { title: lit('One'), leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: 'one' } } }],
    } as unknown as UiNode
    const view = show([group, nextButton({ requiresFilled: true })], run)
    expect(nodeEl(view.container, 'g').getAttribute('aria-required')).toBe('true')
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(true)
    fireEvent.click(nodeEl(view.container, 'o'))
    expect(run.writes).toEqual([['survey.goal', 'one']])
    expect(isDisabled(nodeEl(view.container, 'next'))).toBe(false)
  })

  it('nonStringActionParam: only a non-empty string becomes an action parameter; a number, a flag and an empty string leave the literal in effect', () => {
    const seen: (string | undefined)[] = []
    for (const value of [12, true, '', 'text']) {
      cleanup()
      const view = render(
        <HotlayoutScreen
          document={documentOf([nextButton({ action: { type: 'app.next', params: { n: 'literal' }, paramBindings: { n: 'survey.age' } } })])}
          data={{ 'survey.age': value }}
          onAction={(action) => void seen.push((action.params as Record<string, string> | undefined)?.n)}
          onReport={quiet}
        />,
      )
      fireEvent.click(nodeEl(view.container, 'next'))
    }
    expect(seen).toEqual(['literal', 'literal', 'literal', 'text'])
  })
})

/* ───────────────────────────── untrusted input ───────────────────────────── */

describe('untrusted input', () => {
  it('all wrong shapes: it does not crash and is read by the policy rows', () => {
    const hostile = [
      { id: 'a', type: 'TextField', props: { label: lit('A'), value: bind('survey.name'), required: 'yes', valueType: 5 } },
      { id: 'b', type: 'TextField', props: { label: lit('B'), value: bind('survey.age'), required: true, valueType: 'number', disabledIf: { path: 7, op: 'isTrue' } } },
      { id: 'c', type: 'Button', props: { label: lit('C'), action: { type: 'x' }, requiresFilled: 1, disabledIf: [] } },
      { id: 'd', type: 'Button', props: { label: lit('D'), action: { type: 'x' }, requiresFilled: true, disabledIf: { all: [] } } },
      { id: 'e', type: 'IconButton', props: { icon: 'check', label: lit('E'), action: { type: 'x' }, disabledIf: { path: 'survey.age', op: 'future-op' } } },
      { id: 'f', type: 'Checkbox', props: { label: lit('F'), value: lit('x'), required: true } },
      { id: 'g', type: 'ChoiceGroup', props: { value: 'survey.goal', required: true }, children: [null, 3, { id: 'h' }] },
    ] as unknown as UiNode[]
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentOf(hostile)} onReport={(report) => void reports.push(report)} />)
    // `requiresFilled: 1` is not read: button c is enabled. d: required b, f, g are not filled, so it is disabled. e: an unknown operator, not disabled.
    expect(isDisabled(nodeEl(view.container, 'c'))).toBe(false)
    expect(isDisabled(nodeEl(view.container, 'd'))).toBe(true)
    expect(isDisabled(nodeEl(view.container, 'e'))).toBe(false)
  })

  it('a deep tree: the form traversal is iterative and does not exhaust the stack', () => {
    let node: UiNode = { id: 'leaf', type: 'TextField', props: { label: lit('L'), value: bind('survey.name'), required: true } }
    for (let depth = 0; depth < 150; depth += 1) node = { id: `c${String(depth)}`, type: 'Column', props: {}, children: [node] }
    expect(() => show([node, nextButton({ requiresFilled: true })], newRun())).not.toThrow()
  })

  it('a hostile numeric field path does not reach the host', () => {
    const run = newRun()
    const view = show([numberField({ value: bind('__proto__.age') })], run)
    const el = textbox(view.container)
    focus(el)
    type(el, '12')
    expect(run.writes).toEqual([])
  })

  it('the numeric field length limit concerns the typed text, in code points', () => {
    const run = newRun()
    const view = show([numberField({ maxLength: 3 })], run)
    const el = textbox(view.container)
    focus(el)
    type(el, '12345')
    expect(run.writes).toEqual([['survey.age', 123]])
  })
})

/* ───────────────────────────── server render ───────────────────────────── */

describe('server render of a form', () => {
  const goal = (): UiDocument => ({ ...FIXTURE, initialScreenId: 'goal' })

  it('the button state on the server equals the browser state for the same data', () => {
    for (const data of [{}, { 'survey.goal': 'rewards' }] as const) {
      const server = renderToString(<HotlayoutScreen document={goal()} data={data} onReport={quiet} />)
      const client = render(<HotlayoutScreen document={goal()} data={data} onReport={quiet} />)
      const serverDisabled = /data-hl-node="goal-next"[^>]*aria-disabled="true"/.test(server) || /aria-disabled="true"[^>]*data-hl-node="goal-next"/.test(server)
      expect(serverDisabled).toBe(isDisabled(nodeEl(client.container, 'goal-next')))
      expect(serverDisabled).toBe(!('survey.goal' in data))
      client.unmount()
    }
  })

  it('on the server without window: the numeric field from data and the asterisk are in the markup', () => {
    const details = { ...FIXTURE, initialScreenId: 'details' } as UiDocument
    const server = renderToString(<HotlayoutScreen document={details} data={{ 'survey.age': 42 }} onReport={quiet} />)
    expect(server).toContain('value="42"')
    expect(server).toContain('data-hl-required')
    expect(server).toMatch(/inputmode="decimal"/i)
  })
})

/* ───────────────────────────── survey-screens.json fixture ───────────────────────────── */

describe('the survey-screens.json fixture: a real screen, a walk through "empty → choice → next → name → 12a → 12 → next → consent"', () => {
  const draw = (run: Run, props: Record<string, unknown> = {}) =>
    render(
      <HotlayoutScreen
        document={FIXTURE}
        onWrite={(path, value) => void run.writes.push([path, value])}
        onAction={(action) => void run.actions.push(action.type)}
        onTrack={(event) => void run.tracks.push(event.event)}
        onReport={(report) => void run.reports.push(report)}
        {...props}
      />,
    )
  const onScreen = (view: { container: HTMLElement }, id: string): boolean => view.container.querySelector(`[data-hl-node="${id}"]`) !== null

  function walkToDetails(view: { container: HTMLElement }): void {
    fireEvent.click(nodeEl(view.container, 'rewards'))
    fireEvent.click(nodeEl(view.container, 'goal-next'))
    expect(onScreen(view, 'details-root')).toBe(true)
  }

  it('step 1: "Next" is disabled (opacity 0.5, aria-disabled), click and Enter do nothing, a choice enables it without the host', () => {
    const run = newRun()
    const view = draw(run)
    const next = nodeEl(view.container, 'goal-next')
    expect(isDisabled(next)).toBe(true)
    expect(next.style.opacity).toBe('0.5')
    expect(next.hasAttribute('disabled')).toBe(false)
    fireEvent.click(next)
    browserKey(next, 'Enter')
    expect(onScreen(view, 'goal-root')).toBe(true)
    expect(run.actions).toEqual([])
    expect(run.tracks).toEqual([])
    fireEvent.click(nodeEl(view.container, 'rewards'))
    expect(run.writes).toEqual([['survey.goal', 'rewards']])
    expect(isDisabled(nodeEl(view.container, 'goal-next'))).toBe(false)
    fireEvent.click(nodeEl(view.container, 'goal-next'))
    expect(onScreen(view, 'details-root')).toBe(true)
  })

  it('step 2: name + age: "12a" does not enable, "12" enables (a number), erasing disables (""), "1,5" is 1.5', () => {
    const run = newRun()
    const view = draw(run)
    walkToDetails(view)
    const next = (): HTMLElement => nodeEl(view.container, 'details-next')
    expect(isDisabled(next())).toBe(true)
    const [name, age] = Array.from(view.container.querySelectorAll<HTMLInputElement>('input'))
    focus(name!)
    type(name!, 'Alex')
    expect(isDisabled(next())).toBe(true)
    focus(age!)
    type(age!, '12a')
    expect(isDisabled(next())).toBe(true)
    // A non-number in an empty numeric field is not a change of the number: no write.
    type(age!, '12')
    expect(isDisabled(next())).toBe(false)
    type(age!, '')
    expect(isDisabled(next())).toBe(true)
    type(age!, '1,5')
    expect(isDisabled(next())).toBe(false)
    expect(run.writes.filter(([path]) => path === 'survey.age')).toEqual([
      ['survey.age', 12],
      ['survey.age', ''],
      ['survey.age', 1.5],
    ])
    expect(age!.getAttribute('inputmode')).toBe('decimal')
    expect(view.container.querySelectorAll('[data-hl-required]').length).toBe(2)
  })

  it('step 3: with age 12 "Send" is disabled by the condition even when consent is given; with age 20 consent enables it', () => {
    for (const [age, sendDisabled] of [[12, true], [20, false]] as const) {
      cleanup()
      const run = newRun()
      const view = draw(run)
      walkToDetails(view)
      const [name, ageField] = Array.from(view.container.querySelectorAll<HTMLInputElement>('input'))
      focus(name!)
      type(name!, 'Alex')
      focus(ageField!)
      type(ageField!, String(age))
      fireEvent.click(nodeEl(view.container, 'details-next'))
      expect(onScreen(view, 'consent-root')).toBe(true)
      expect(isDisabled(nodeEl(view.container, 'send'))).toBe(true)
      fireEvent.click(nodeEl(view.container, 'agree').querySelector('[role="checkbox"]')!)
      expect(isDisabled(nodeEl(view.container, 'send'))).toBe(sendDisabled)
      fireEvent.click(nodeEl(view.container, 'send'))
      expect(onScreen(view, age < 16 ? 'consent-root' : 'done-root')).toBe(true)
    }
  })

  it.each(['en', 'uk', 'ar'])('locale %s: the first step is drawn with a disabled "Next"; Arabic is right to left', (locale) => {
    const view = draw(newRun(), { locale })
    expect(isDisabled(nodeEl(view.container, 'goal-next'))).toBe(true)
    if (locale === 'ar') expect(view.container.querySelector('[dir="rtl"]') ?? view.container.firstElementChild?.getAttribute('dir')).toBeTruthy()
  })

  it('with host data (dictionary samples) the form is filled at once: "Next" is enabled', () => {
    const view = draw(newRun(), { data: { 'survey.goal': 'rewards' } })
    expect(isDisabled(nodeEl(view.container, 'goal-next'))).toBe(false)
  })
})
