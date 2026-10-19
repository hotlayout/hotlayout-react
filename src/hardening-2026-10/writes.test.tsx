/**
 * Limit 5 — writes. `onWrite` is called only for a person's gesture and only within
 * `writablePaths`: never while a screen just sits there (timers, motion, countdowns, transitions),
 * never for a value the platform put into a field the person has not touched, and never for a
 * path that only LOOKS like an allowed one.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sampleData } from '../../test-support/sample-data'
import { HotlayoutScreen } from '../index'
import type { UiDocument, UiNode } from '../index'
import { screenFixtures } from '../../test-support/hardening-kit'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function screenWith(children: readonly UiNode[]): UiDocument {
  return {
    schemaVersion: '9.27.0',
    documentId: 'writes',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

const setValueButton = (id: string, path: string): UiNode =>
  ({ id, type: 'Button', props: { label: { kind: 'literal', value: id }, variant: 'primary', action: { type: 'setValue', params: { path, value: 'x' } } } }) as unknown as UiNode

describe('limit 5: no write without a gesture', () => {
  it('every fixture screen left alone for ten minutes (timers, countdowns, motion, transitions) writes nothing', () => {
    vi.useFakeTimers()
    const { data, collections } = sampleData()
    const writes: string[] = []
    for (const fixture of screenFixtures()) {
      const screens = (fixture.document as { screens: readonly { screenId?: unknown }[] }).screens
      for (const screen of screens) {
        if (typeof screen.screenId !== 'string') continue
        const shown = { ...fixture.document, initialScreenId: screen.screenId } as UiDocument
        const { rerender, unmount } = render(<HotlayoutScreen document={shown} data={data} collections={collections} onReport={() => undefined} onWrite={(path) => writes.push(`${fixture.name}: ${path}`)} />)
        act(() => {
          vi.advanceTimersByTime(600_000)
        })
        // New data from the host (a transition, a live record) is not a gesture either.
        rerender(<HotlayoutScreen document={shown} data={{ ...data }} collections={{ ...collections }} onReport={() => undefined} onWrite={(path) => writes.push(`${fixture.name}: ${path}`)} />)
        act(() => {
          vi.advanceTimersByTime(10_000)
        })
        unmount()
      }
    }
    expect(writes).toEqual([])
  }, 120_000)

  it('a value the platform puts into fields nobody touched is not written', () => {
    const inputs = screenFixtures().find((fixture) => fixture.name === 'inputs-screens.json')
    if (inputs === undefined) throw new Error('no inputs fixture')
    const writes: string[] = []
    const { container } = render(<HotlayoutScreen document={inputs.document} onReport={() => undefined} onWrite={(path) => writes.push(path)} />)
    const fields = [...container.querySelectorAll('input:not([type="checkbox"]), textarea')]
    expect(fields.length).toBeGreaterThan(0)
    for (const field of fields) fireEvent.change(field, { target: { value: 'filled by the platform' } })
    expect(writes).toEqual([])
  })
})

describe('limit 5: a path that only looks allowed is not allowed', () => {
  it('whitespace, case, a trailing dot, an empty segment, a full-width dot and a zero-width character do not pass an exact list', () => {
    const lookalikes = ['account.period ', ' account.period', 'Account.period', 'account.period.', 'account..period', 'account．period', 'account.​period', 'account.period\u0000']
    const writes: string[] = []
    const { container } = render(
      <HotlayoutScreen
        document={screenWith(lookalikes.map((path, index) => setValueButton(`b${String(index)}`, path)))}
        onReport={() => undefined}
        writablePaths={['account.period']}
        onWrite={(path) => writes.push(path)}
      />,
    )
    for (const element of [...container.querySelectorAll('button')]) fireEvent.click(element, { detail: 1 })
    expect(writes.map((path) => JSON.stringify(path))).toEqual([])
  })

  it('control: the exact path is written once per press', () => {
    const writes: string[] = []
    const { container } = render(<HotlayoutScreen document={screenWith([setValueButton('ok', 'account.period')])} onReport={() => undefined} writablePaths={['account.period']} onWrite={(path) => writes.push(path)} />)
    const element = container.querySelector('button')
    if (element === null) throw new Error('no button')
    fireEvent.click(element, { detail: 1 })
    expect(writes).toEqual(['account.period'])
  })
})
