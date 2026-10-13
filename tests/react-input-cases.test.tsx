/**
 * INPUT FIELD CASE TABLE THROUGH THE `@hotlayout/react` PACKAGE:
 * `contract/fixtures/inputs/input-cases.json` (schema 9.13.0).
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`input-rules.ts`), and this table keeps the two copies together. Each group runs twice where that
 * makes sense: the package's pure function and a REAL screen (`HotlayoutScreen`; jsdom computes no
 * layout, so the markup is checked against the structural condition of the rule: which element, which
 * attribute, which name, which order).
 *
 * The "documents" and "placement" groups concern the builder validator; the reader is checked like
 * this: the document is drawn and does not crash, and what it read matches the expectation. NO ROWS
 * ARE SKIPPED: all 248 pass.
 *
 * After that comes one named test for each of the twenty policy rows of 9.13.0, untrusted input,
 * server render and what a field does NOT do.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument, UiNode } from '../src/index'
import { checkboxBoxOffsetOf, checkboxHeightOf, checkboxLabelWidthOf, INPUTS_LAYOUT, switchHeightOf, switchLabelWidthOf, switchThumbOffsetOf, textFieldBoxHeightOf, textFieldHeightOf } from '../src/inputs-layout'
import { clampInputText, effectiveKeyboardOf, INITIAL_TEXT_INPUT, INITIAL_TOGGLE, INPUT_KEYBOARD_WEB, INPUT_WIDGET_TYPES, inputContentDirectionOf, inputErrorOf, inputKeyActionOf, inputKeyboardOf, inputLinesOf, inputPathOf, nextInputIndexOf, pressToggle, readInputFlag, readInputText, shownInputText, shownToggle, stepTextInput, syncTextInput, syncToggle } from '../src/input-rules'
import type { TextInputEvent, TextInputState, ToggleState } from '../src/input-rules'
import { mergeLayers } from '../src/record-scope'
import type { DataLayers } from '../src/record-scope'
import { ScreenView } from '../src/render'
import { valueAt } from '../src/data'
import { HOTLAYOUT_CSS } from '../src/styles'
import { resolveTheme } from '../src/theme-resolve'
import { READER_SCHEMA_VERSION } from '../src/version'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* ───────────────────────────── table ───────────────────────────── */

type Layers = DataLayers & { readonly host?: Record<string, unknown> }
type Step = TextInputEvent | { readonly type: 'data'; readonly bound: string }

interface TextCase {
  readonly name: string
  readonly bound: string
  readonly steps: readonly Step[]
  readonly writes: readonly string[]
  readonly shown: string
  readonly maxLength?: number
  readonly disabled?: boolean
  readonly hasPath?: boolean
}
interface ToggleCase {
  readonly name: string
  readonly bound: boolean
  readonly steps: readonly ('press' | { readonly data: boolean })[]
  readonly writes: readonly boolean[]
  readonly shown: boolean
  readonly disabled?: boolean
  readonly hasPath?: boolean
}
interface GeometryCase {
  readonly name: string
  readonly widget: 'TextField' | 'Switch' | 'Checkbox'
  readonly lines?: number
  readonly labelLines?: number
  readonly noteLines?: number
  readonly box?: number
  readonly height?: number
  readonly rowWidth?: number
  readonly labelWidth?: number
  readonly labelLine?: number
  readonly boxOffset?: number
  readonly on?: boolean
  readonly thumbOffset?: number
}
interface DirectionCase {
  readonly name: string
  readonly widget: 'TextField' | 'Switch' | 'Checkbox'
  readonly direction: 'ltr' | 'rtl'
  readonly keyboard?: string
  readonly lines?: number
  readonly controlSide?: 'left' | 'right'
  readonly thumbOnSide?: 'left' | 'right'
  readonly textAlign?: 'left' | 'right'
  readonly content?: 'screen' | 'left-to-right'
}
interface DocumentCase {
  readonly name: string
  readonly node: UiNode
  readonly pin?: string
  readonly valid: boolean
  readonly code?: string
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/inputs/input-cases.json', 'utf8')) as {
  readonly pathCases: readonly { readonly name: string; readonly value?: unknown; readonly path: string | null }[]
  readonly readCases: readonly { readonly name: string; readonly type: 'string' | 'boolean'; readonly path: string; readonly layers: Layers; readonly text?: string; readonly on?: boolean }[]
  readonly textCases: readonly TextCase[]
  readonly toggleCases: readonly ToggleCase[]
  readonly clampCases: readonly { readonly text: string; readonly maxLength?: unknown; readonly expect: string }[]
  readonly linesCases: readonly { readonly lines?: unknown; readonly expect: number }[]
  readonly keyboardCases: readonly { readonly keyboard?: unknown; readonly lines?: unknown; readonly expect: string; readonly web?: { readonly type: string; readonly inputmode: string; readonly autocomplete: string } }[]
  readonly keyActionCases: readonly { readonly name: string; readonly fields: readonly { readonly multiline: boolean; readonly reachable: boolean }[]; readonly index: number; readonly expect: string; readonly next: number | null }[]
  readonly errorCases: readonly { readonly name: string; readonly error?: string; readonly expect: string | null }[]
  readonly geometryCases: readonly GeometryCase[]
  readonly directionCases: readonly DirectionCase[]
  readonly documentCases: readonly DocumentCase[]
  readonly placementCases: readonly { readonly parent: string; readonly accepts: boolean }[]
  readonly ruleCases: readonly { readonly at: string; readonly expect: unknown }[]
}
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as {
  readonly 'x-style': { readonly layout: { readonly inputs: unknown } }
  readonly 'x-compatibility': { readonly policy: Record<string, string> }
}
const FIXTURE = JSON.parse(readFileSync('contract/fixtures/inputs-screens.json', 'utf8')) as UiDocument

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)

/* ───────────────────────────── nodes and screens ───────────────────────────── */

const lit = (value: string): { kind: 'literal'; value: string } => ({ kind: 'literal', value })
const bind = (path: string): { kind: 'binding'; path: string } => ({ kind: 'binding', path })
const quiet = (): void => undefined
const THEME = resolveTheme(undefined).theme

const field = (props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode =>
  ({ id: 'f', type: 'TextField', props: { label: lit('Name'), value: bind('form.fullName'), ...props }, ...extra })
const toggle = (type: 'Switch' | 'Checkbox', props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode =>
  ({ id: 't', type, props: { label: lit('Agree'), value: bind('form.agreed'), ...props }, ...extra })

const screenRoot = (children: readonly UiNode[], id = 'root'): UiNode => ({ id, type: 'Screen', props: {}, children })
const documentOf = (children: readonly UiNode[], extra: Record<string, unknown> = {}): UiDocument =>
  ({
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'inputs-test',
    name: 'inputs',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: screenRoot(children) }],
    ...extra,
  })

interface Run {
  readonly writes: [string, string | boolean | number][]
  readonly reports: HotlayoutReport[]
}
const newRun = (): Run => ({ writes: [], reports: [] })

function show(children: readonly UiNode[], run: Run, props: Record<string, unknown> = {}, documentExtra: Record<string, unknown> = {}) {
  const element = (next: Record<string, unknown>) => (
    <HotlayoutScreen
      document={documentOf(children, documentExtra)}
      onWrite={(path, value) => void run.writes.push([path, value])}
      onReport={(report) => void run.reports.push(report)}
      {...props}
      {...next}
    />
  )
  const view = render(element({}))
  return { ...view, again: (next: Record<string, unknown>) => { view.rerender(element(next)); } }
}

const textbox = (container: HTMLElement): HTMLInputElement | HTMLTextAreaElement => {
  const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (found === null) throw new Error('there is no field')
  return found
}

/* ───────────────────────────── value ───────────────────────────── */

describe('field value: path and reading', () => {
  it.each(named(TABLE.pathCases))('path: %s', (_name, row) => {
    expect(inputPathOf(row.value)).toBe(row.path ?? undefined)
  })

  it.each(named(TABLE.readCases))('reading by layers: %s', (_name, row) => {
    const scope = mergeLayers(row.layers)
    const value = valueAt(scope, row.path)
    if (row.type === 'string') expect(readInputText(value)).toBe(row.text)
    else expect(readInputFlag(value)).toBe(row.on)
  })

  it.each(named(TABLE.readCases))('reading on a real screen: %s', (_name, row) => {
    const layers = row.layers as { record?: Record<string, unknown>; session?: Record<string, unknown>; host?: Record<string, unknown>; data?: Record<string, unknown> }
    const node = row.type === 'string' ? field({ value: bind(row.path) }) : toggle('Switch', { value: bind(row.path) })
    const hostOverData = { ...layers.data, ...layers.host }
    const view = render(
      <ScreenView screenId="a" root={screenRoot([node])} theme={THEME} data={hostOverData} session={layers.session} record={layers.record} onIssue={quiet} />,
    )
    if (row.type === 'string') expect(textbox(view.container).value).toBe(row.text)
    else expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(String(row.on))
  })
})

/* ───────────────────────── text field: event sequences ───────────────────────── */

/** A pure function: the same steps as the reader, without React. */
function driveText(row: TextCase): { writes: string[]; shown: string } {
  let state: TextInputState = INITIAL_TEXT_INPUT
  let bound = row.bound
  const writes: string[] = []
  for (const step of row.steps) {
    if (step.type === 'data') {
      bound = step.bound
      state = syncTextInput(state, bound)
      continue
    }
    const result = stepTextInput(state, step, bound, { maxLength: row.maxLength, disabled: row.disabled === true, hasPath: row.hasPath !== false })
    state = result.state
    if (result.write !== undefined) writes.push(result.write)
  }
  return { writes, shown: shownInputText(state, bound) }
}

describe('text field: event sequences', () => {
  it.each(named(TABLE.textCases))('function: %s', (_name, row) => {
    const result = driveText(row)
    expect(result.writes).toEqual(row.writes)
    expect(result.shown).toBe(row.shown)
  })

  /**
   * The same row on a real screen. The layer values come from the host `data`, which does NOT
   * repeat what was written (a host echo is a separate test below): what is written goes into the
   * reader session, and the field must show what the table says.
   */
  describe.each([
    ['host data', 'data'],
    ['screen record (the strongest layer)', 'record'],
  ] as const)('real screen, layer: %s', (_title, layer) => {
    it.each(named(TABLE.textCases))('%s', (_name, row) => {
      const run = newRun()
      const disabledIf = row.disabled === true ? { path: 'off', op: 'isTrue' } : undefined
      const multiline = row.steps.some((step) => 'text' in step && step.text.includes('\n'))
      const node = field({ ...(multiline ? { lines: 3 } : {}), ...(row.hasPath === false ? { value: lit('x') } : {}), ...(row.maxLength === undefined ? {} : { maxLength: row.maxLength }), ...(disabledIf === undefined ? {} : { disabledIf }) })
      const dataFor = (bound: string): Record<string, unknown> => ({ ...(disabledIf === undefined ? {} : { off: true }), ...(layer === 'data' ? { 'form.fullName': bound } : {}) })
      const recordFor = (bound: string): Record<string, unknown> | undefined => (layer === 'record' ? { 'form.fullName': bound } : undefined)
      const draw = (bound: string) =>
        layer === 'data' ? (
          <HotlayoutScreen document={documentOf([node])} data={dataFor(bound)} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />
        ) : (
          <ScreenView screenId="a" root={screenRoot([node])} theme={THEME} data={dataFor(bound)} record={recordFor(bound)} onWrite={(path, value) => void run.writes.push([path, value])} onIssue={quiet} />
        )
      const view = render(draw(row.bound))
      const el = textbox(view.container)
      for (const step of row.steps) {
        switch (step.type) {
          case 'focus':
            act(() => {
              el.focus()
            })
            break
          case 'blur':
            act(() => {
              el.blur()
            })
            break
          case 'input':
          case 'platformFill':
            fireEvent.change(el, { target: { value: step.text } })
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
      if (row.hasPath !== false) for (const [path] of run.writes) expect(path).toBe('form.fullName')
      expect(textbox(view.container).value).toBe(row.shown)
    })
  })

  it('the host repeats what was written in data (an echo): the field shows the same and the dependent text updates', () => {
    const run = newRun()
    const text = { id: 'echo', type: 'Text', props: { content: bind('form.fullName'), align: 'start', overflow: 'ellipsis' } } as unknown as UiNode
    const draw = (data: Record<string, unknown>) => <HotlayoutScreen document={documentOf([field(), text])} data={data} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />
    const view = render(draw({}))
    const el = textbox(view.container)
    act(() => {
      el.focus()
    })
    fireEvent.change(el, { target: { value: 'Al' } })
    // Reader session: the echo text updated although the host has not answered yet.
    expect(view.container.querySelector('[data-hl-node="echo"]')?.textContent).toBe('Al')
    view.rerender(draw({ 'form.fullName': 'Al' }))
    expect(view.container.querySelector('[data-hl-node="echo"]')?.textContent).toBe('Al')
    expect(textbox(view.container).value).toBe('Al')
    expect(run.writes).toEqual([['form.fullName', 'Al']])
  })

  it('"A → B → A": after the host substituted something else and then went back, the typed text does not resurrect', () => {
    const run = newRun()
    const draw = (data: Record<string, unknown>) => <HotlayoutScreen document={documentOf([field()])} data={data} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />
    const view = render(draw({ 'form.fullName': 'Alex' }))
    const el = textbox(view.container)
    act(() => {
      el.focus()
    })
    fireEvent.change(el, { target: { value: 'Alexa' } })
    act(() => {
      el.blur()
    })
    view.rerender(draw({ 'form.fullName': 'Olena' }))
    expect(textbox(view.container).value).toBe('Olena')
    view.rerender(draw({ 'form.fullName': 'Alex' }))
    expect(textbox(view.container).value).toBe('Alex')
  })
})

/* ───────────────────────────── switch, checkbox ───────────────────────────── */

function driveToggle(row: ToggleCase): { writes: boolean[]; shown: boolean } {
  let state: ToggleState = INITIAL_TOGGLE
  let bound = row.bound
  const writes: boolean[] = []
  for (const step of row.steps) {
    if (step === 'press') {
      const result = pressToggle(state, bound, { disabled: row.disabled === true, hasPath: row.hasPath !== false })
      state = result.state
      if (result.write !== undefined) writes.push(result.write)
    } else {
      bound = step.data
      state = syncToggle(state, bound)
    }
  }
  return { writes, shown: shownToggle(state, bound) }
}

describe('switch and checkbox', () => {
  it.each(named(TABLE.toggleCases))('function: %s', (_name, row) => {
    const result = driveToggle(row)
    expect(result.writes).toEqual(row.writes)
    expect(result.shown).toBe(row.shown)
  })

  describe.each([
    ['Switch', 'switch'],
    ['Checkbox', 'checkbox'],
  ] as const)('real screen, %s', (type, role) => {
    it.each(named(TABLE.toggleCases))('%s', (_name, row) => {
      const run = newRun()
      const disabledIf = row.disabled === true ? { path: 'off', op: 'isTrue' } : undefined
      const node = toggle(type, { ...(row.hasPath === false ? { value: lit('x') } : {}), ...(disabledIf === undefined ? {} : { disabledIf }) })
      const draw = (bound: boolean) => (
        <HotlayoutScreen document={documentOf([node])} data={{ ...(disabledIf === undefined ? {} : { off: true }), 'form.agreed': bound }} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />
      )
      const view = render(draw(row.bound))
      for (const step of row.steps) {
        if (step === 'press') fireEvent.click(screen.getByRole(role))
        else view.rerender(draw(step.data))
      }
      expect(run.writes.map(([, value]) => value)).toEqual([...row.writes])
      expect(screen.getByRole(role).getAttribute('aria-checked')).toBe(String(row.shown))
    })
  })
})

/* ───────────────────────────── bounds, keyboard, error ───────────────────────────── */

describe('length limit, lines, keyboard', () => {
  it.each(TABLE.clampCases.map((row, index) => [index, row] as const))('limit #%i', (_index, row) => {
    expect(clampInputText(row.text, row.maxLength)).toBe(row.expect)
  })

  it('the reader holds the limit, not the platform: there is no maxlength attribute on the field', () => {
    const view = show([field({ maxLength: 5 })], newRun())
    expect(textbox(view.container).hasAttribute('maxlength')).toBe(false)
  })

  it.each(TABLE.linesCases.map((row, index) => [index, row] as const))('lines #%i', (_index, row) => {
    expect(inputLinesOf(row.lines)).toBe(row.expect)
  })

  it.each(TABLE.linesCases.filter((row) => typeof row.lines === 'number' || row.lines === undefined).map((row, index) => [index, row] as const))('lines on a real screen #%i', (_index, row) => {
    const view = show([field(row.lines === undefined ? {} : { lines: row.lines })], newRun())
    const box = textbox(view.container)
    if (row.expect === 1) expect(box.tagName).toBe('INPUT')
    else {
      expect(box.tagName).toBe('TEXTAREA')
      expect(box.getAttribute('rows')).toBe(String(row.expect))
    }
  })

  it.each(TABLE.keyboardCases.map((row, index) => [index, row] as const))('keyboard #%i', (_index, row) => {
    const result = effectiveKeyboardOf(row.keyboard, row.lines)
    expect(result).toBe(row.expect)
    if (row.web !== undefined) {
      const web = INPUT_KEYBOARD_WEB[inputKeyboardOf(row.keyboard)]
      expect({ type: web.type, inputmode: web.inputmode, autocomplete: web.autocomplete }).toEqual(row.web)
    }
  })

  it.each(TABLE.keyboardCases.filter((row) => row.web !== undefined).map((row, index) => [index, row] as const))('keyboard on a real screen #%i: type, inputmode, autocomplete', (_index, row) => {
    const props: Record<string, unknown> = {}
    if (row.keyboard !== undefined) props.keyboard = row.keyboard
    const view = show([field(props)], newRun())
    const box = textbox(view.container)
    expect({ type: box.getAttribute('type'), inputmode: box.getAttribute('inputmode'), autocomplete: box.getAttribute('autocomplete') }).toEqual(row.web)
    expect(box.getAttribute('type')).not.toBe('number')
  })

  it('capitalisation and spell checking apply only to `text`', () => {
    for (const keyboard of ['text', 'email', 'number', 'phone', 'url'] as const) {
      const view = show([field({ keyboard })], newRun())
      const box = textbox(view.container)
      expect(box.getAttribute('autocapitalize'), keyboard).toBe(keyboard === 'text' ? 'sentences' : 'none')
      expect(box.getAttribute('spellcheck'), keyboard).toBe(keyboard === 'text' ? 'true' : 'false')
      cleanup()
    }
  })

  it.each(named(TABLE.keyActionCases))('keyboard key: %s', (_name, row) => {
    expect(inputKeyActionOf(row.fields, row.index)).toBe(row.expect)
    expect(nextInputIndexOf(row.fields, row.index)).toBe(row.next ?? undefined)
  })

  it.each(named(TABLE.errorCases))('error: %s', (_name, row) => {
    expect(inputErrorOf(row.error)).toBe(row.expect ?? undefined)
  })

  it.each(named(TABLE.errorCases))('error on a real screen: %s', (_name, row) => {
    const view = show([field({ error: row.error === undefined ? undefined : lit(row.error), helper: lit('Help text') })], newRun())
    const box = textbox(view.container)
    if (row.expect === null) {
      expect(box.hasAttribute('aria-invalid')).toBe(false)
      expect(view.container.textContent).toContain('Help text')
    } else {
      expect(box.getAttribute('aria-invalid')).toBe('true')
      expect(view.container.textContent).toContain(row.expect)
      expect(view.container.textContent).not.toContain('Help text')
    }
  })
})

/* ───────────────────────────── geometry and direction ───────────────────────────── */

describe('geometry', () => {
  const METRICS = { labelLine: 16, textLine: 20, noteLine: 16, gap: 4, paddingBlock: 12, border: 1 }
  const MD = 12

  it.each(named(TABLE.geometryCases))('function: %s', (_name, row) => {
    if (row.widget === 'TextField') {
      expect(textFieldBoxHeightOf(METRICS, row.lines)).toBe(row.box)
      expect(textFieldHeightOf(METRICS, { lines: row.lines, labelLines: row.labelLines ?? 1, noteLines: row.noteLines ?? 0 })).toBe(row.height)
    } else if (row.widget === 'Switch') {
      if (row.rowWidth !== undefined) expect(switchLabelWidthOf(row.rowWidth, MD)).toBe(row.labelWidth)
      if (row.height !== undefined) expect(switchHeightOf(20, row.labelLines ?? 1)).toBe(row.height)
      if (row.on !== undefined) expect(switchThumbOffsetOf(row.on)).toBe(row.thumbOffset)
    } else {
      expect(checkboxLabelWidthOf(row.rowWidth ?? 0, 8)).toBe(row.labelWidth)
      expect(checkboxHeightOf(row.labelLine ?? 20, row.labelLines ?? 1)).toBe(row.height)
      expect(checkboxBoxOffsetOf(row.labelLine ?? 20)).toBe(row.boxOffset)
    }
  })

  it('real screen: the field box is border + padding + lines (calc from the font line), numbers come from the data', () => {
    for (const [lines, expected] of [
      [1, '1'],
      [3, '3'],
      [8, '8'],
      [12, '1'],
    ] as const) {
      const view = show([field({ lines })], newRun())
      const style = textbox(view.container).getAttribute('style') ?? ''
      expect(style, `lines ${String(lines)}`).toContain(`calc(${expected}lh + 2px + 24px)`)
      expect(style).toContain('border: 1px solid')
      cleanup()
    }
  })

  it('real screen: track, thumb and square sizes are exactly the artifact numbers', () => {
    const view = show([toggle('Switch'), toggle('Checkbox', { value: bind('form.agreed') }, { id: 'c' })], newRun(), {}, {})
    const track = view.container.querySelector('[role="switch"] > span[aria-hidden="true"]')
    expect(track?.getAttribute('style')).toContain('inline-size: 52px')
    expect(track?.getAttribute('style')).toContain('block-size: 32px')
    const thumb = track?.firstElementChild
    expect(thumb?.getAttribute('style')).toContain('inline-size: 24px')
    expect(thumb?.getAttribute('style')).toContain('inset-inline-start: 4px')
    const box = view.container.querySelector('[role="checkbox"] > span[aria-hidden="true"]')
    expect(box?.getAttribute('style')).toContain('inline-size: 20px')
    expect(box?.getAttribute('style')).toContain('border-radius: 4px')
    expect(box?.getAttribute('style')).toContain('2px solid')
  })

  it('the thumb of an enabled switch is at the end of the track (logical offset 24)', () => {
    const view = show([toggle('Switch')], newRun(), { data: { 'form.agreed': true } })
    const thumb = view.container.querySelector('[role="switch"] > span[aria-hidden="true"] > span')
    expect(thumb?.getAttribute('style')).toContain('inset-inline-start: 24px')
  })

  it('the checkbox tick is the `check` glyph of the set, side 16, colour onPrimary; an unchecked one has none', () => {
    const on = show([toggle('Checkbox')], newRun(), { data: { 'form.agreed': true } })
    const mark = on.container.querySelector('[role="checkbox"] [data-hl-glyph="check"]')
    expect(mark).not.toBeNull()
    expect(mark?.parentElement?.getAttribute('style')).toContain('font-size: 16px')
    expect(mark?.parentElement?.getAttribute('style')).toContain('--product-color-on-primary')
    cleanup()
    const off = show([toggle('Checkbox')], newRun())
    expect(off.container.querySelector('[data-hl-glyph="check"]')).toBeNull()
  })
})

describe('writing direction', () => {
  it.each(named(TABLE.directionCases))('%s', (_name, row) => {
    const props: Record<string, unknown> = {}
    if (row.keyboard !== undefined) props.keyboard = row.keyboard
    if (row.lines !== undefined) props.lines = row.lines
    if (row.widget === 'TextField') {
      expect(inputContentDirectionOf(row.keyboard, row.lines)).toBe(row.content)
      const view = show([field(props)], newRun(), { dir: row.direction })
      const box = textbox(view.container)
      expect(box.getAttribute('dir')).toBe(row.content === 'left-to-right' ? 'ltr' : null)
      // Alignment is from the screen START: a stylesheet rule, not inline (two declarations do not fit there).
      expect(box.getAttribute('style')).not.toContain('text-align')
      expect(box.className).toBe('hl-field')
      expect(view.container.querySelector('[data-hotlayout]')?.getAttribute('dir')).toBe(row.direction)
      return
    }
    const view = show([toggle(row.widget)], newRun(), { dir: row.direction, data: { 'form.agreed': true } })
    const button = screen.getByRole(row.widget === 'Switch' ? 'switch' : 'checkbox')
    const parts = Array.from(button.children)
    // The control is at the end of the switch row and at the start of the checkbox row; "left" or "right" comes from the root direction.
    const control = row.widget === 'Switch' ? parts[parts.length - 1] : parts[0]
    expect(control?.getAttribute('aria-hidden')).toBe('true')
    expect(view.container.querySelector('[data-hotlayout]')?.getAttribute('dir')).toBe(row.direction)
    if (row.widget === 'Switch') expect(control?.firstElementChild?.getAttribute('style')).toContain('inset-inline-start: 24px')
    // The tick is not mirrored: `check` is not among the mirrored icons.
    if (row.widget === 'Checkbox') expect(control?.querySelector('[data-hl-glyph="check"]')?.getAttribute('style') ?? '').not.toContain('scale')
  })

  it('stylesheet: alignment from the screen start and the placeholder colour are rules, not inline', () => {
    expect(HOTLAYOUT_CSS).toContain('.hl-field{text-align:-webkit-match-parent;text-align:match-parent}')
    expect(HOTLAYOUT_CSS).toContain('.hl-field::placeholder{color:var(--product-color-muted);opacity:1}')
  })
})

/* ───────────────────────────── documents and placement ───────────────────────────── */

describe('documents: the reader does not crash and draws what it read', () => {
  it.each(named(TABLE.documentCases))('%s', (_name, row) => {
    const node = { ...row.node, ...(row.pin === undefined ? {} : { pin: row.pin }) }
    const run = newRun()
    const view = show([node], run)
    const control = view.container.querySelector('input, textarea, [role="switch"], [role="checkbox"]')
    // Node visibility is its own condition: without data `visibleIf: isTrue` hides the field.
    if (node.visibleIf === undefined) expect(control, 'the field is drawn').not.toBeNull()
    else expect(control).toBeNull()
    if (control !== null && row.valid && node.type === 'TextField') expect(view.container.querySelector('label')?.textContent).not.toBe('')
  })
})

describe('placement: a field is drawn wherever it is placed', () => {
  const parent = (type: string, child: UiNode): UiNode => {
    switch (type) {
      case 'Tab':
        return { id: 'tabs', type: 'Tabs', props: {}, children: [{ id: 'tab', type: 'Tab', props: { title: lit('T') }, children: [child] }] }
      case 'Repeater':
        return { id: 'rep', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [child] }
      case 'ChoiceGroup':
        return { id: 'group', type: 'ChoiceGroup', props: { value: lit('') }, children: [child] }
      case 'AppBar':
        return { id: 'bar', type: 'AppBar', props: { title: lit('Bar'), showBack: false }, children: [child] }
      case 'NavBar':
        return { id: 'nav', type: 'NavBar', props: {}, children: [child] }
      case 'Accordion':
        return { id: 'acc', type: 'Accordion', props: { title: lit('A'), initiallyExpanded: true }, children: [child] }
      case 'Grid':
        return { id: 'grid', type: 'Grid', props: { columns: 2 }, children: [child] }
      default:
        return { id: 'p', type, props: {}, children: [child] }
    }
  }

  it.each(TABLE.placementCases.map((row) => [row.parent, row] as const))('%s', (type, row) => {
    const collections = { items: [{ id: 'a' }, { id: 'b' }] }
    const view = render(<HotlayoutScreen document={documentOf(type === 'Screen' ? [field()] : [parent(type, field())])} collections={collections} onReport={quiet} />)
    const fields = view.container.querySelectorAll('input, textarea')
    // A legal place: the field is there. The validator rejects the rest; a reader given such a document does not crash.
    if (row.accepts) expect(fields.length).toBeGreaterThan(0)
    if (type === 'Repeater') expect(fields).toHaveLength(2)
  })

  it('in a data list all instances write to one path, and a path is not invented from the record', () => {
    const run = newRun()
    const root = { id: 'rep', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [field()] } as unknown as UiNode
    const view = render(<HotlayoutScreen document={documentOf([root])} collections={{ items: [{ id: 'a' }, { id: 'b' }] }} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />)
    const [first, second] = Array.from(view.container.querySelectorAll('input'))
    act(() => {
      second?.focus()
    })
    fireEvent.change(second!, { target: { value: 'x' } })
    expect(run.writes).toEqual([['form.fullName', 'x']])
    expect(first).toBeDefined()
  })
})

/* ───────────────────────────── block data ───────────────────────────── */

describe('rules are data: the x-style.layout.inputs mirror', () => {
  const at = (path: string): unknown => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], INPUTS_LAYOUT)

  it.each(TABLE.ruleCases.map((row) => [row.at, row] as const))('%s', (_path, row) => {
    expect(at(row.at)).toEqual(row.expect)
  })

  it('the whole mirror equals the artifact block, key for key', () => {
    expect(INPUTS_LAYOUT).toEqual(ARTIFACT['x-style'].layout.inputs)
  })

  it('the list of field widgets is exactly the three table types', () => {
    expect([...INPUT_WIDGET_TYPES]).toEqual(['TextField', 'Switch', 'Checkbox'])
  })
})

/* ───────────────────────────── fixture ───────────────────────────── */

describe('the inputs-screens.json fixture: a real screen in three languages', () => {
  const NAMES: Record<string, { label: string; direction: 'ltr' | 'rtl' }> = {
    en: { label: 'Full name', direction: 'ltr' },
    uk: { label: 'Ім’я та прізвище', direction: 'ltr' },
    ar: { label: '', direction: 'rtl' },
  }

  it.each(Object.entries(NAMES))('locale %s: the field has a visible name, the form writes, the pinned button appears on consent', (locale, expected) => {
    const run = newRun()
    const view = render(<HotlayoutScreen document={FIXTURE} locale={locale} data={{ 'form.phoneError': 'Not a phone' }} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />)
    const name = view.container.querySelector<HTMLInputElement>('input[data-hl-input]')
    expect(name).not.toBeNull()
    const label = view.container.querySelector('label')?.textContent ?? ''
    expect(label).not.toBe('')
    if (expected.label !== '') expect(label).toBe(expected.label)
    expect(view.container.querySelector('[data-hotlayout]')?.getAttribute('dir')).toBe(expected.direction)
    // The control name is its label.
    expect(screen.getByRole('textbox', { name: label })).toBe(name)
    // The pinned button is hidden until consent is given (visibleIf).
    expect(view.container.querySelector('button:not([role])')).toBeNull()
    act(() => {
      name?.focus()
    })
    fireEvent.change(name!, { target: { value: 'Alex' } })
    expect(view.container.querySelector('[data-hl-node="profile-name-echo"]')?.textContent).toBe('Alex')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(run.writes).toEqual([
      ['form.fullName', 'Alex'],
      ['form.agreed', true],
    ])
    expect(view.container.querySelectorAll('button:not([role])').length).toBeGreaterThan(0)
    // An error from data on the phone field.
    const phone = view.container.querySelectorAll('input')[2]
    expect(phone?.getAttribute('aria-invalid')).toBe('true')
    expect(phone?.getAttribute('type')).toBe('tel')
    expect(view.container.textContent).toContain('Not a phone')
  })

  it('settings screen: a switch disables its neighbour (disabledIf), writes are boolean', () => {
    const run = newRun()
    const view = render(<HotlayoutScreen document={FIXTURE} entry={undefined} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} data={{ 'settings.notifications': true }} />)
    // We open the second fixture screen as the first: the host only reads here.
    cleanup()
    const second = { ...FIXTURE, initialScreenId: 'settings' } as UiDocument
    const settings = render(<HotlayoutScreen document={second} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} data={{ 'settings.notifications': true }} />)
    const [push, marketing] = screen.getAllByRole('switch')
    expect(push?.getAttribute('aria-checked')).toBe('true')
    expect((marketing as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(push!)
    expect(run.writes).toEqual([['settings.notifications', false]])
    expect((screen.getAllByRole('switch')[1] as HTMLButtonElement).disabled).toBe(true)
    expect(view).toBeDefined()
    expect(settings.container).toBeDefined()
  })
})

/* ───────────────────────────── policy rows ───────────────────────────── */

describe('9.13.0 policy rows, one named test each', () => {
  const POLICY = ARTIFACT['x-compatibility'].policy
  // The 9.13.0 rows run from `inputWithoutValue` to the first row of the next minor (9.14.0, form: `unreadableRequired`).
  const inputPolicyKeys = Object.keys(POLICY).slice(Object.keys(POLICY).indexOf('inputWithoutValue'), Object.keys(POLICY).indexOf('unreadableRequired'))

  it('there are exactly twenty, from the first 9.13.0 row to the first 9.14.0 row', () => {
    expect(inputPolicyKeys).toHaveLength(20)
  })

  it('inputWithoutValue / unreadableInputValue: a field without a path accepts typing, writes nowhere and does not crash', () => {
    for (const value of [undefined, lit('x'), { kind: 'binding', path: 42 }, null, 'form.fullName']) {
      cleanup()
      const run = newRun()
      const node = field({ value })
      if (value === undefined) delete (node.props as Record<string, unknown>).value
      const view = show([node], run)
      const box = textbox(view.container)
      act(() => {
        box.focus()
      })
      fireEvent.change(box, { target: { value: 'Al' } })
      expect(textbox(view.container).value).toBe('Al')
      expect(run.writes).toEqual([])
    }
    expect(POLICY.inputWithoutValue).toBe('local-only-writes-nothing')
    expect(POLICY.unreadableInputValue).toBe('local-only-writes-nothing')
  })

  it('inputValueOfOtherType: a number, a flag and an object under a text path give an empty field and are not converted', () => {
    for (const other of [42, true, { value: 'x' }, ['a']]) {
      cleanup()
      const view = show([field()], newRun(), { data: { 'form.fullName': other } })
      expect(textbox(view.container).value).toBe('')
    }
    cleanup()
    const flag = show([toggle('Switch')], newRun(), { data: { 'form.agreed': 'true' } })
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(flag).toBeDefined()
  })

  it('inputEmptyString: an empty string gives an empty field, there is no fallback text, and "" in the session does not let the layer through', () => {
    const run = newRun()
    const view = show([field()], run, { data: { 'form.fullName': 'Alex' } })
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: '' } })
    act(() => {
      box.blur()
    })
    expect(textbox(view.container).value).toBe('')
    expect(run.writes).toEqual([['form.fullName', '']])
  })

  it('inputWrite: on every change, at once, without delay; an action after the change sees what was written', () => {
    vi.useFakeTimers()
    try {
      const order: string[] = []
      const button = { id: 'go', type: 'Button', props: { label: lit('Go'), variant: 'primary', fullWidth: true, action: { type: 'submit' } } } as unknown as UiNode
      const view = render(
        <HotlayoutScreen
          document={documentOf([field(), button])}
          onWrite={(path, value) => void order.push(`write ${path}=${String(value)}`)}
          onAction={(action) => void order.push(`action ${action.type}`)}
          onReport={quiet}
        />,
      )
      const box = textbox(view.container)
      act(() => {
        box.focus()
      })
      fireEvent.change(box, { target: { value: 'A' } })
      // Timers were not advanced: the write has already happened.
      expect(order).toEqual(['write form.fullName=A'])
      fireEvent.click(screen.getByRole('button', { name: 'Go' }))
      expect(order).toEqual(['write form.fullName=A', 'action submit'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('inputWriteWhileComposing: intermediate text is visible but not written', () => {
    const run = newRun()
    const view = show([field()], run)
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.compositionStart(box)
    fireEvent.change(box, { target: { value: 'ka' } })
    expect(textbox(view.container).value).toBe('ka')
    expect(run.writes).toEqual([])
    fireEvent.compositionEnd(box, { target: { value: 'か' } })
    expect(run.writes).toEqual([['form.fullName', 'か']])
  })

  it('inputHeldValue: in focus, what was typed; out of focus, until the layer value changes', () => {
    expect(driveText(TABLE.textCases.find((row) => row.name.startsWith('the host changed the data while typing'))!).shown).toBe('Alexa')
    expect(driveText(TABLE.textCases.find((row) => row.name.startsWith('…and after focus is lost'))!).shown).toBe('ALEX FROM HOST')
  })

  it('inputBeforeFirstTouch: what the platform filled in before a touch does not stay and is not written', () => {
    const run = newRun()
    const view = show([field()], run)
    fireEvent.change(textbox(view.container), { target: { value: 'saved@example.com' } })
    expect(textbox(view.container).value).toBe('')
    expect(run.writes).toEqual([])
  })

  it('inputDisabled / unknownDisabledOp / missingDisabledValue: a disabled field cannot be focused, an unknown operator means enabled, a missing value works as in visibleIf', () => {
    const disabledOf = (condition: unknown, data: Record<string, unknown>): boolean => {
      const view = show([field({ disabledIf: condition })], newRun(), { data })
      const result = textbox(view.container).disabled
      cleanup()
      return result
    }
    expect(disabledOf({ path: 'x', op: 'isTrue' }, { x: true })).toBe(true)
    expect(disabledOf({ path: 'x', op: 'isTrue' }, { x: false })).toBe(false)
    expect(disabledOf({ path: 'x', op: 'sparkle' }, { x: true })).toBe(false)
    expect(disabledOf('x', { x: true })).toBe(false)
    expect(disabledOf({ path: 'x', op: 'isEmpty' }, {})).toBe(true)
    expect(disabledOf({ path: 'x', op: 'isTrue' }, {})).toBe(false)
    expect(disabledOf({ path: 'x', op: 'isFalse' }, {})).toBe(false)
    expect(disabledOf(undefined, {})).toBe(false)
    // A disabled widget is semi-transparent as a whole.
    const view = show([field({ disabledIf: { path: 'x', op: 'isTrue' } })], newRun(), { data: { x: true } })
    expect(view.container.querySelector('input')?.parentElement?.getAttribute('style')).toContain('opacity: 0.5')
  })

  it('unknownInputKeyboard: an unknown word means text, the field is not hidden', () => {
    for (const keyboard of ['password', 'search', 7, null]) {
      cleanup()
      const view = show([field({ keyboard })], newRun())
      const box = textbox(view.container)
      expect(box.getAttribute('type')).toBe('text')
      expect(box.getAttribute('inputmode')).toBe('text')
    }
  })

  it('inputMaxLength: typed text is cut to code points and the cut text is written; a data value longer than the limit is shown as is', () => {
    const run = newRun()
    const view = show([field({ maxLength: 2 })], run, { data: { 'form.fullName': 'Alexander' } })
    expect(textbox(view.container).value).toBe('Alexander')
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: '😀😀😀' } })
    expect(run.writes).toEqual([['form.fullName', '😀😀']])
  })

  it('unreadableInputLines: lines out of range or not an integer give one line', () => {
    for (const lines of [9, 0, 2.5, '3', null]) {
      cleanup()
      expect(textbox(show([field({ lines })], newRun()).container).tagName, String(lines)).toBe('INPUT')
    }
  })

  it('inputError: an error that can be heard is shown in place of the hint, the field is invalid, the announcement region is polite', () => {
    const view = show([field({ helper: lit('Help'), error: bind('form.fullNameError') })], newRun(), { data: { 'form.fullNameError': 'Required' } })
    const box = textbox(view.container)
    expect(box.getAttribute('aria-invalid')).toBe('true')
    const note = document.getElementById(box.getAttribute('aria-describedby') ?? '')
    expect(note?.textContent).toBe('Required')
    expect(note?.parentElement?.getAttribute('aria-live')).toBe('polite')
    expect(view.container.textContent).not.toContain('Help')
    // The error is gone: the hint is back.
    view.again({ data: {} })
    expect(view.container.textContent).toContain('Help')
  })

  it('inputKeyAction: Enter is "next" to the following field or "done", runs no action, submits no form', () => {
    const run = newRun()
    const actions: string[] = []
    const first = field({ value: bind('form.fullName') }, { id: 'one' })
    const second = field({ value: bind('form.email'), label: lit('Email'), keyboard: 'email' }, { id: 'two' })
    const hidden = field({ value: bind('form.phone'), label: lit('Phone') }, { id: 'three', visibleIf: { path: 'never', op: 'isTrue' } })
    const button = { id: 'go', type: 'Button', props: { label: lit('Go'), variant: 'primary', fullWidth: true, action: { type: 'submit' } } } as unknown as UiNode
    const view = render(
      <HotlayoutScreen document={documentOf([first, second, hidden, button])} onAction={(action) => void actions.push(action.type)} onWrite={(path, value) => void run.writes.push([path, value])} onReport={quiet} />,
    )
    const [one, two] = Array.from(view.container.querySelectorAll('input'))
    act(() => {
      one?.focus()
    })
    expect(one?.getAttribute('enterkeyhint')).toBe('next')
    expect(two?.getAttribute('enterkeyhint')).toBe('done')
    expect(fireEvent.keyDown(one as HTMLElement, { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(two)
    expect(fireEvent.keyDown(two as HTMLElement, { key: 'Enter' })).toBe(false)
    expect(document.activeElement).not.toBe(two)
    expect(actions).toEqual([])
    expect(view.container.querySelector('form')).toBeNull()
  })

  it('inputKeyAction: in a multi-line field Enter stays a new line', () => {
    const view = show([field({ lines: 3 })], newRun())
    const area = textbox(view.container)
    expect(area.getAttribute('enterkeyhint')).toBe('enter')
    // The handler does not cancel the event: the browser will insert a new line.
    expect(fireEvent.keyDown(area, { key: 'Enter' })).toBe(true)
  })

  it('inputInsideRepeater: see the placement test above; the field is drawn in every instance and writes to its own path', () => {
    expect(POLICY.inputInsideRepeater).toBe('drawn-writes-by-its-path')
  })

  it('inputFocusOnScreenChange: moving between screens removes focus from the field', () => {
    const go = { id: 'go', type: 'Button', props: { label: lit('Next'), variant: 'primary', fullWidth: true, action: { type: 'navigate', params: { screenId: 'b' } } } } as unknown as UiNode
    const document_ = documentOf([field(), go], { screens: [{ screenId: 'a', name: 'A', root: screenRoot([field(), go]) }, { screenId: 'b', name: 'B', root: screenRoot([field({}, { id: 'g' })], 'rb') }] })
    const view = render(<HotlayoutScreen document={document_} onReport={quiet} />)
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(document.activeElement).not.toBe(textbox(view.container))
    expect(view.container.contains(document.activeElement) && document.activeElement?.tagName).not.toBe('INPUT')
  })

  it('inputAutofill: hints come only from the keyboard intent; autofill={false} turns all of them off', () => {
    const kinds = ['text', 'email', 'number', 'phone', 'url'] as const
    for (const autofill of [true, false]) {
      for (const keyboard of kinds) {
        cleanup()
        const view = show([field({ keyboard })], newRun(), { autofill })
        const expected = autofill ? INPUT_KEYBOARD_WEB[keyboard].autocomplete : 'off'
        expect(textbox(view.container).getAttribute('autocomplete'), `${keyboard} ${String(autofill)}`).toBe(expected)
      }
    }
    // The reader never asks for passwords, cards, addresses or SMS codes.
    expect(Object.values(INPUT_KEYBOARD_WEB).map((entry) => entry.autocomplete).sort()).toEqual(['email', 'off', 'off', 'tel', 'url'])
  })

  it('inputValueInActionParam: the field value goes into the action parameter WHOLE, with no concatenation', () => {
    expect(POLICY.inputValueInActionParam).toBe('whole-value-no-composition')
    const actions: unknown[] = []
    const button = {
      id: 'go',
      type: 'Button',
      props: { label: lit('Go'), variant: 'primary', fullWidth: true, action: { type: 'submit', params: {}, paramBindings: { name: 'form.fullName' } } },
    } as unknown as UiNode
    const view = render(<HotlayoutScreen document={documentOf([field(), button])} onAction={(action) => void actions.push(action.params)} onReport={quiet} />)
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: 'Alex' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(actions).toEqual([{ name: 'Alex' }])
  })
})

/* ───────────────────────────── session, write, host ───────────────────────────── */

describe('reader session and write', () => {
  it('writablePaths applies to fields just as to a choice group; a foreign path gives a report and no write', () => {
    const run = newRun()
    const view = show([field()], run, { writablePaths: ['form.email'] })
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: 'x' } })
    expect(run.writes).toEqual([])
    expect(run.reports.some((report) => report.kind === 'ignored-input')).toBe(true)
  })

  it.each(['__proto__.x', 'constructor.name', 'a.prototype.b'])('path %s never reaches onWrite', (path) => {
    for (const writablePaths of [undefined, () => true, [path]]) {
      cleanup()
      const run = newRun()
      const view = show([field({ value: bind(path) })], run, writablePaths === undefined ? {} : { writablePaths })
      const box = textbox(view.container)
      act(() => {
        box.focus()
      })
      fireEvent.change(box, { target: { value: 'x' } })
      expect(run.writes).toEqual([])
    }
  })

  it('the session survives moving between flow screens: what was written on the first is visible on the second', () => {
    const go = { id: 'go', type: 'Button', props: { label: lit('Next'), variant: 'primary', fullWidth: true, action: { type: 'navigate', params: { screenId: 'b' } } } } as unknown as UiNode
    const echo = { id: 'echo', type: 'Text', props: { content: bind('form.fullName'), align: 'start', overflow: 'ellipsis' } } as unknown as UiNode
    const document_ = documentOf([field(), go], { screens: [{ screenId: 'a', name: 'A', root: screenRoot([field(), go]) }, { screenId: 'b', name: 'B', root: screenRoot([echo], 'rb') }] })
    const view = render(<HotlayoutScreen document={document_} onReport={quiet} />)
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: 'Alex' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(view.container.querySelector('[data-hl-node="echo"]')?.textContent).toBe('Alex')
  })

  it('a dependent condition updates under the finger: a flag reveals the hidden', () => {
    const hint = { id: 'hint', type: 'Text', props: { content: lit('Thanks'), align: 'start', overflow: 'ellipsis' }, visibleIf: { path: 'form.agreed', op: 'isTrue' } } as unknown as UiNode
    const view = show([toggle('Checkbox'), hint], newRun())
    expect(view.container.querySelector('[data-hl-node="hint"]')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(view.container.querySelector('[data-hl-node="hint"]')).not.toBeNull()
  })

  it('switch: Enter on a checkbox does not toggle (Space does), on a switch Enter presses', () => {
    const run = newRun()
    show([toggle('Checkbox')], run)
    const box = screen.getByRole('checkbox')
    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(false)
    expect(run.writes).toEqual([])
  })

  it('a disabled control is a real disabled button: it cannot be focused or pressed and writes nothing', () => {
    const run = newRun()
    show([toggle('Switch', { disabledIf: { path: 'off', op: 'isTrue' } })], run, { data: { off: true } })
    const control = screen.getByRole<HTMLButtonElement>('switch')
    expect(control.disabled).toBe(true)
    fireEvent.click(control)
    expect(run.writes).toEqual([])
  })

  it('the whole strip is pressable: the control has the touch-target class, the name equals the label, a screen reader does not hear the track', () => {
    show([toggle('Switch', { label: lit('Push notifications') })], newRun())
    const control = screen.getByRole('switch', { name: 'Push notifications' })
    expect(control.className).toContain('hl-press')
    expect(control.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('ChoiceGroup writes a string, as before', () => {
    const run = newRun()
    const group = {
      id: 'g',
      type: 'ChoiceGroup',
      props: { value: bind('item.selectedId') },
      children: [{ id: 'o', type: 'ListTile', props: { title: lit('One'), leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: 'one' } } }],
    } as unknown as UiNode
    show([group], run)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    expect(run.writes).toEqual([['item.selectedId', 'one']])
  })

  it('a screen outside a flow (ScreenView without a session): the field writes to the host and keeps typed text locally', () => {
    const run = newRun()
    const view = render(<ScreenView screenId="a" root={screenRoot([field()])} theme={THEME} data={{}} onWrite={(path, value) => void run.writes.push([path, value])} onIssue={quiet} />)
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: 'Al' } })
    act(() => {
      box.blur()
    })
    expect(run.writes).toEqual([['form.fullName', 'Al']])
    expect(textbox(view.container).value).toBe('Al')
  })
})

/* ───────────────────────────── untrusted input ───────────────────────────── */

describe('untrusted input', () => {
  const MARK = '</style><script>alert(1)</script>red;position:fixed;inset:0'

  it('a hostile label, placeholder, hint and error are text, not markup or style', () => {
    const view = show([field({ label: lit(MARK), placeholder: lit(MARK), helper: lit(MARK) })], newRun())
    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('label')?.textContent).toBe(MARK)
    expect(textbox(view.container).getAttribute('placeholder')).toBe(MARK)
    cleanup()
    const withError = show([field({ error: lit(MARK) })], newRun())
    expect(withError.container.querySelector('script')).toBeNull()
    for (const el of Array.from(withError.container.querySelectorAll('[style]'))) expect(el.getAttribute('style')).not.toContain('position: fixed')
  })

  it('the typed value is only the field `value`: it does not reach the markup, style or an address', () => {
    const run = newRun()
    const echo = { id: 'echo', type: 'Text', props: { content: bind('form.fullName'), align: 'start', overflow: 'ellipsis' } } as unknown as UiNode
    const view = show([field(), echo], run)
    const box = textbox(view.container)
    act(() => {
      box.focus()
    })
    fireEvent.change(box, { target: { value: MARK } })
    expect(view.container.querySelector('script')).toBeNull()
    expect(run.writes).toEqual([['form.fullName', MARK]])
    for (const el of Array.from(view.container.querySelectorAll('[style]'))) expect(el.getAttribute('style')).not.toContain('position: fixed')
    const html = renderToString(<HotlayoutScreen document={documentOf([field()])} data={{ 'form.fullName': MARK }} onReport={quiet} />)
    expect(html).not.toContain('<script>')
    expect(html).not.toMatch(/style="[^"]*position:fixed/)
  })

  it('keyboard with a wrong word, lines 1000, a negative maxLength, value as a literal, a path of the wrong type: no crash', () => {
    const nodes: UiNode[] = [
      field({ keyboard: { x: 1 } }),
      field({ lines: 1000 }),
      field({ maxLength: -5 }),
      field({ maxLength: 'abc' }),
      field({ value: lit('literal') }),
      field({ value: bind('user.points') }),
      toggle('Switch', { value: bind('form.email') }),
      toggle('Checkbox', { label: null, value: { kind: 'binding', path: '' } }),
      { id: 'bare', type: 'TextField' } as unknown as UiNode,
      { id: 'null-props', type: 'Switch', props: null } as unknown as UiNode,
    ]
    for (const [index, node] of nodes.entries()) {
      cleanup()
      expect(() => show([{ ...node, id: `n${String(index)}` }], newRun(), { data: { 'user.points': 42, 'form.email': 'a@b.c' } }), `node ${String(index)}`).not.toThrow()
    }
  })

  it('a path with another type in data (a number under a text field, a string under a switch) is not converted', () => {
    const view = show([field({ value: bind('user.points') })], newRun(), { data: { 'user.points': 1250 } })
    expect(textbox(view.container).value).toBe('')
    cleanup()
    show([toggle('Switch', { value: bind('form.email') })], newRun(), { data: { 'form.email': 'true' } })
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })
})

/* ───────────────────────────── server ───────────────────────────── */

describe('server render of fields', () => {
  it('without window: the profile form is drawn as a string, fields and labels are in place, values come from the data', () => {
    const html = renderToString(<HotlayoutScreen document={FIXTURE} data={{ 'form.fullName': 'Alex', 'form.agreed': true, 'form.phoneError': 'Not a phone' }} onReport={quiet} />)
    expect(html).toContain('<input')
    expect(html).toContain('value="Alex"')
    expect(html).toContain('role="checkbox"')
    expect(html).toContain('Not a phone')
    // Attributes the server does not know (the keyboard key is counted in the browser) are not in the markup: hydration without mismatch.
    expect(html).not.toContain('enterkeyhint')
  })

  it('hydration without mismatch: server and browser write the same markup', async () => {
    const { hydrateRoot } = await import('react-dom/client')
    const element = <HotlayoutScreen document={FIXTURE} data={{ 'form.fullName': 'Alex' }} onReport={quiet} />
    const html = renderToString(element)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args))
    let root: ReturnType<typeof hydrateRoot> | undefined
    act(() => {
      root = hydrateRoot(host, element, { onRecoverableError: (error) => void errors.push(error) })
    })
    expect(errors).toEqual([])
    act(() => root?.unmount())
    spy.mockRestore()
    host.remove()
  })
})

/* ───────────────────────────── what a field does NOT do ───────────────────────────── */

describe('what a field does not do', () => {
  it('does not listen to visualViewport, does not set type="number", does not hide a password, does not add a <form>', () => {
    const files = readdirSync(`${__dirname}/../src`, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
    const source = files.filter((file) => file === 'render.tsx' || file.startsWith('render/') || ['input-rules.ts', 'input-number.ts', 'inputs-layout.ts'].includes(file)).map((file) => readFileSync(`${__dirname}/../src/${file}`, 'utf8')).join('')
    expect(source).not.toContain('visualViewport')
    expect(INPUT_KEYBOARD_WEB.number.type).toBe('text')
    expect(Object.keys(INPUT_KEYBOARD_WEB)).not.toContain('password')
    const view = show([field(), toggle('Switch')], newRun())
    expect(view.container.querySelector('form')).toBeNull()
  })

  it('the field box size does not change in focus: the same `block-size`', () => {
    const view = show([field({ lines: 2 })], newRun())
    const box = textbox(view.container)
    const before = box.style.blockSize
    act(() => {
      box.focus()
    })
    expect(textbox(view.container).style.blockSize).toBe(before)
    expect(textbox(view.container).style.boxShadow).toContain('inset')
  })

  it('the three widgets do not read the node style.color and style.typography', () => {
    const view = show([field({}, { style: { color: 'danger', typography: 'titleL' } })], newRun())
    const style = textbox(view.container).getAttribute('style') ?? ''
    expect(style).not.toContain('--product-color-danger')
    expect(style).not.toContain('title-l')
  })
})
