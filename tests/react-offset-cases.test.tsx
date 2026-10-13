/**
 * OFFSET STACKING CASE TABLE THROUGH THE `@hotlayout/react` PACKAGE:
 * `contract/fixtures/offset/offset-cases.json` (schema 9.10.0): `layer` on a `Stack` child and `pull`
 * on a flow child.
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`layer-placement.ts`), and this table keeps the two copies together. Each group runs twice: the
 * package's pure function and a REAL `HotlayoutScreen` (jsdom computes no layout, so the markup is
 * checked against the structural condition of the rule: who is in the overlay cell, which alignment
 * words, which offset and angle, on which element the negative margin sits). The angle is taken from
 * server render: jsdom drops `rotate` from `style`.
 *
 * The "reference" groups (`layerDocumentCases`, `pullDocumentCases`) concern the builder validator;
 * the reader is checked like this: the document is drawn and does not crash. NO ROWS ARE SKIPPED.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { UiDocument } from '../src/index'
import { effectivePull, layerContainsPoint, layerGeometry, pullAxisOf, pullFlow, readerLayerOf, readLayerValue, sizesStack } from '../src/layer-placement'

afterEach(cleanup)

type Raw = Record<string, unknown>
interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
interface Table {
  readonly tokens: { readonly spacing: Record<string, number> }
  readonly layerCases: readonly {
    name: string
    stack: { width: number; height: number }
    stackAlign: { horizontal: 'start' | 'center' | 'end'; vertical: 'start' | 'center' | 'end' }
    size: { width: number; height: number }
    layer: Raw
    ltr: { rect: Rect; angle: number; taps: readonly { x: number; y: number; hits: boolean }[] }
    rtl: { rect: Rect; angle: number; taps: readonly { x: number; y: number; hits: boolean }[] }
    protrudes?: boolean
  }[]
  readonly layerReadCases: readonly { name: string; value: unknown; expect: Raw | null }[]
  readonly layerPlaceCases: readonly {
    name: string
    parent: string
    children: readonly Raw[]
    hidden?: readonly boolean[]
    overlays: readonly boolean[]
    sizesStack: readonly boolean[]
    visibleSizers?: number
  }[]
  readonly layerDocumentCases: readonly { name: string; parent: string; children: readonly Raw[]; schema: boolean; issues: readonly string[] }[]
  readonly pullCases: readonly { name: string; gap: number; children: readonly { size: number; pull?: number }[]; starts: readonly number[]; size: number }[]
  readonly pullReadCases: readonly { name: string; parent: string; parentProps: Raw; nodeType?: string; nodeFirst?: boolean; node: Raw; expect: { by: string | number; axis: 'column' | 'row' } | null }[]
  readonly pullDocumentCases: readonly { name: string; parent: string; parentProps: Raw; nodeType?: string; nodeFirst?: boolean; node: Raw; schema: boolean; issues: readonly string[] }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/offset/offset-cases.json', 'utf8')) as Table
const named = <TRow extends { readonly name: string }>(rows: readonly TRow[]): readonly (readonly [string, TRow])[] => rows.map((row) => [row.name, row] as const)
const lit = (value: string): Raw => ({ kind: 'literal', value })
const quiet = (): undefined => undefined

/** A table row node: plain text with the row fields (`layer`, `fill`, `visibleIf`, `weight`, `pull`). */
const textNode = (id: string, fields: Raw = {}): Raw => ({ id, type: 'Text', props: { content: lit(id), style: 'bodyM' }, ...fields })
const parentNode = (type: string, props: Raw, children: readonly Raw[]): Raw => ({ id: 'parent', type, props, children })
const documentOf = (children: readonly Raw[], parent: Raw | undefined): UiDocument => {
  const content = parent === undefined ? children : [parent]
  return {
    schemaVersion: '9.11.0',
    documentId: 'offset-cases',
    name: 'cases',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: content } }],
  } as unknown as UiDocument
}
const markupOf = (document: UiDocument, dir: 'ltr' | 'rtl' = 'ltr'): string => renderToStaticMarkup(<HotlayoutScreen document={document} dir={dir} />)
const spacingOf = (by: unknown): string => (typeof by === 'number' ? (by === 0 ? '0' : `${String(by)}px`) : `var(--product-space-${String(by)})`)
// Built-in theme numbers: the package puts a NUMBER with a unit into CSS math, not a variable (a `none` variable is a bare `0` and the expression would be invalid).
const SPACE_PX = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
const spx = (token: string): number => (SPACE_PX as Readonly<Record<string, number>>)[token] ?? 0

/** A table row stack: a plain size layer and an overlay with `layer`. */
function stackDocument(layer: unknown, align: { horizontal: string; vertical: string } = { horizontal: 'center', vertical: 'center' }): UiDocument {
  return documentOf([], parentNode('Stack', { alignHorizontal: align.horizontal, alignVertical: align.vertical }, [textNode('sizer'), textNode('badge', { layer })]))
}

describe('offset stacking case table: structure', () => {
  it('the row count equals the reference; names within a group are unique', () => {
    expect(TABLE.layerCases).toHaveLength(12)
    expect(TABLE.layerReadCases).toHaveLength(21)
    expect(TABLE.layerPlaceCases).toHaveLength(10)
    expect(TABLE.layerDocumentCases).toHaveLength(16)
    expect(TABLE.pullCases).toHaveLength(10)
    expect(TABLE.pullReadCases).toHaveLength(20)
    expect(TABLE.pullDocumentCases).toHaveLength(12)
    for (const group of [TABLE.layerCases, TABLE.layerReadCases, TABLE.layerPlaceCases, TABLE.layerDocumentCases, TABLE.pullCases, TABLE.pullReadCases, TABLE.pullDocumentCases]) {
      expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
    }
  })
})

/* ───────────────────────────── layer ───────────────────────────── */

describe('layer: geometry', () => {
  const geometryOf = (row: Table['layerCases'][number], direction: 'ltr' | 'rtl'): ReturnType<typeof layerGeometry> => {
    const layer = readLayerValue(row.layer)
    if (layer === undefined) throw new Error('a geometry row without an overlay')
    const px = (ref: string | number): number => (typeof ref === 'number' ? ref : (TABLE.tokens.spacing[ref] ?? 0))
    return layerGeometry({
      stack: row.stack,
      layer: row.size,
      alignHorizontal: layer.alignHorizontal ?? row.stackAlign.horizontal,
      alignVertical: layer.alignVertical ?? row.stackAlign.vertical,
      ...(layer.offsetX === undefined ? {} : { offsetX: { toward: layer.offsetX.toward, by: px(layer.offsetX.by) } }),
      ...(layer.offsetY === undefined ? {} : { offsetY: { toward: layer.offsetY.toward, by: px(layer.offsetY.by) } }),
      rotate: layer.rotate,
      direction,
    })
  }

  it.each(named(TABLE.layerCases))('function: %s', (_name, row) => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const expected = row[direction]
      const geometry = geometryOf(row, direction)
      expect(geometry.rect).toEqual(expected.rect)
      expect(geometry.angle).toBe(expected.angle)
      // A press where it is DRAWN, within the stack box.
      for (const tap of expected.taps) expect(layerContainsPoint(geometry, tap), `${direction} (${String(tap.x)}, ${String(tap.y)})`).toBe(tap.hits)
      if (row.protrudes !== undefined) expect(geometry.protrudes).toBe(row.protrudes)
    }
  })

  /*
   * Markup: the layer own words lie on its cell (no word means `inherit`, i.e. the stack word), the
   * offset is logical node properties (in right-to-left writing an "end" offset goes by itself), the
   * angle is a signed `rotate` that flips in RTL (one mirror).
   */
  it.each(named(TABLE.layerCases))('real screen: %s', (_name, row) => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const document = stackDocument(row.layer, row.stackAlign)
      const markup = markupOf(document, direction)
      const view = render(<HotlayoutScreen document={document} dir={direction} onReport={quiet} />)
      const cell = view.container.querySelector<HTMLElement>('[data-hl-layer]')
      expect(cell, direction).not.toBeNull()
      const layer = readLayerValue(row.layer)
      expect(cell?.style.justifyItems).toBe(layer?.alignHorizontal ?? 'inherit')
      expect(cell?.style.alignItems).toBe(layer?.alignVertical ?? 'inherit')
      // An overlay does not measure the stack: the cell contribution to the tracks is zero, and it catches no cursor.
      expect(cell?.style.contain).toBe('size')
      expect(cell?.style.pointerEvents).toBe('none')
      const node = view.container.querySelector<HTMLElement>('[data-hl-node="badge"]')!
      expect(node.style.position).toBe('relative')
      expect(node.style.pointerEvents).toBe('auto')
      // Angle: the sign flips in RTL; zero means no rotation.
      const angle = row[direction].angle
      if (angle === 0) expect(markup).not.toContain('rotate:')
      else expect(markup).toContain(`rotate:${String(angle)}deg`)
      view.unmount()
    }
  })
})

describe('layer: reading the value', () => {
  it.each(named(TABLE.layerReadCases))('function: %s', (_name, row) => {
    const read = readLayerValue(row.value)
    if (row.expect === null) {
      expect(read).toBeUndefined()
      return
    }
    expect(read).toEqual({
      alignHorizontal: row.expect.alignHorizontal ?? undefined,
      alignVertical: row.expect.alignVertical ?? undefined,
      offsetX: row.expect.offsetX ?? undefined,
      offsetY: row.expect.offsetY ?? undefined,
      rotate: row.expect.rotate,
    })
  })

  it.each(named(TABLE.layerReadCases))('real screen: %s', (_name, row) => {
    const document = stackDocument(row.value)
    const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
    const cell = view.container.querySelector<HTMLElement>('[data-hl-layer]')
    const node = view.container.querySelector<HTMLElement>('[data-hl-node="badge"]')!
    if (row.expect === null) {
      // Not an object: an ordinary layer, without an overlay cell and without its own place.
      expect(cell).toBeNull()
      expect(node.style.insetInlineStart).toBe('')
      return
    }
    const expected = row.expect as { alignHorizontal: string | null; alignVertical: string | null; offsetX: { toward: string; by: string | number } | null; offsetY: { toward: string; by: string | number } | null; rotate: number }
    expect(cell?.style.justifyItems).toBe(expected.alignHorizontal ?? 'inherit')
    expect(cell?.style.alignItems).toBe(expected.alignVertical ?? 'inherit')
    // Offset: the word gives the direction; `end` horizontally and `bottom` vertically are a positive value, the rest negative.
    const signed = (ref: { toward: string; by: string | number } | null, positive: string): string => {
      if (ref === null) return ''
      const size = spacingOf(ref.by)
      if (ref.toward === positive || size === '0') return size
      return typeof ref.by === 'number' ? `-${String(ref.by)}px` : `calc(-${String(spx(ref.by))}px)`
    }
    expect(node.style.insetInlineStart).toBe(signed(expected.offsetX, 'end'))
    expect(node.style.insetBlockStart).toBe(signed(expected.offsetY, 'bottom'))
    const markup = markupOf(document)
    if (expected.rotate === 0) expect(markup).not.toContain('rotate:')
    else expect(markup).toContain(`rotate:${String(expected.rotate)}deg`)
  })
})

describe('layer: where the field is read and who measures the stack', () => {
  const nodesOf = (row: Table['layerPlaceCases'][number]): { readonly parent: Raw; readonly children: Raw[] } => {
    const children = row.children.map((fields, index) => textNode(`c${String(index)}`, fields))
    const props = row.parent === 'Grid' ? { columns: 2 } : {}
    return { parent: { type: row.parent, props, children }, children }
  }

  it.each(named(TABLE.layerPlaceCases))('function: %s', (_name, row) => {
    const { parent, children } = nodesOf(row)
    expect(children.map((child) => readerLayerOf(child as never, parent as never) !== undefined)).toEqual([...row.overlays])
    expect(children.map((child) => sizesStack(child as never, parent as never))).toEqual([...row.sizesStack])
  })

  it.each(named(TABLE.layerPlaceCases))('real screen: %s', (_name, row) => {
    const children = row.children.map((fields, index) => {
      const hidden = row.hidden?.[index] === true
      return textNode(`c${String(index)}`, hidden ? { ...fields, visibleIf: { path: 'user.isPremium', op: 'isTrue' } } : fields)
    })
    const props = row.parent === 'Grid' ? { columns: 2 } : row.parent === 'Stack' ? { alignHorizontal: 'center', alignVertical: 'center' } : {}
    const document = documentOf([], parentNode(row.parent, props, children))
    const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
    // Exactly what the table says becomes an overlay (by the DOCUMENT, not by visibility).
    const cells = [...view.container.querySelectorAll('[data-hl-layer]')]
    expect(cells).toHaveLength(row.overlays.filter(Boolean).length)
    const drawnOverlays = row.overlays.filter((overlay, index) => overlay && row.hidden?.[index] !== true).length
    expect(cells.filter((cell) => cell.querySelector('[data-hl-node]') !== null)).toHaveLength(drawnOverlays)
    if (row.visibleSizers !== undefined) {
      const sizers = children.filter((_child, index) => row.sizesStack[index] === true && row.hidden?.[index] !== true)
      expect(sizers).toHaveLength(row.visibleSizers)
      for (const sizer of sizers) expect(view.container.querySelector(`[data-hl-node="${String(sizer.id)}"]`)).not.toBeNull()
    }
  })

  it('a "full-stack layer" stays stretched, and an overlay stays an overlay next to the size layer', () => {
    const document = documentOf([], parentNode('Stack', {}, [textNode('base'), textNode('wash', { fill: true }), textNode('badge', { layer: { alignHorizontal: 'end' } })]))
    const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
    expect(view.container.querySelectorAll('[data-hl-layer]')).toHaveLength(1)
    expect(view.container.querySelector<HTMLElement>('[data-hl-node="wash"]')!.style.position).toBe('absolute')
  })

  it('layer order is document order: an overlay written first lies under the rest', () => {
    const document = documentOf([], parentNode('Stack', {}, [textNode('first', { layer: {} }), textNode('second')]))
    const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
    const order = [...view.container.querySelectorAll('[data-hl-node]')].map((element) => element.getAttribute('data-hl-node'))
    expect(order.indexOf('first')).toBeLessThan(order.indexOf('second'))
  })
})

describe('layer: table documents; validator reference, the reader draws and does not crash', () => {
  it.each(named(TABLE.layerDocumentCases))('%s', (_name, row) => {
    const children = row.children.map((fields, index) => textNode(`c${String(index)}`, fields))
    const reports: unknown[] = []
    const view = render(<HotlayoutScreen document={documentOf([], parentNode(row.parent, row.parent === 'Grid' ? { columns: 2 } : {}, children))} onReport={(report) => (report.kind === 'render-error' ? reports.push(report) : undefined)} />)
    expect(reports).toEqual([])
    for (const child of children) expect(view.container.querySelector(`[data-hl-node="${String(child.id)}"]`)).not.toBeNull()
  })
})

/* ───────────────────────────── pull ───────────────────────────── */

describe('pull: flow arithmetic', () => {
  it.each(named(TABLE.pullCases))('function: %s', (_name, row) => {
    const flow = pullFlow(row.children, row.gap)
    expect(flow.starts).toEqual([...row.starts])
    expect(flow.size).toBe(row.size)
  })

  /*
   * Markup: a pulled child carries a negative `margin-block-start` on the OUTER element of its place;
   * the parent gap stays (`gap` is read by CSS), so the overlap is `pull − gap`; a later node lies
   * above an earlier one (`position: relative` on every pulled node).
   */
  it.each(named(TABLE.pullCases))('real screen: %s', (_name, row) => {
    const children = row.children.map((child, index) => textNode(`c${String(index)}`, child.pull === undefined ? {} : { pull: child.pull }))
    const view = render(<HotlayoutScreen document={documentOf([], parentNode('Column', { gap: row.gap }, children))} onReport={quiet} />)
    const column = view.container.querySelector<HTMLElement>('[data-hl-node="parent"]')!
    // jsdom writes zero as `0px`.
    expect(column.style.gap).toBe(`${String(row.gap)}px`)
    row.children.forEach((child, index) => {
      const element = view.container.querySelector<HTMLElement>(`[data-hl-node="c${String(index)}"]`)!
      // Zero is already pulling by zero: the field is there but equals zero.
      expect(element.style.marginBlockStart, `child ${String(index)}`).toBe(child.pull === undefined ? '' : child.pull === 0 ? '0px' : `-${String(child.pull)}px`)
      if (child.pull !== undefined) expect(element.style.position).toBe('relative')
    })
    // A later node in the document comes later in the markup: the paint order is the document order.
    const order = [...column.querySelectorAll('[data-hl-node]')].map((element) => element.getAttribute('data-hl-node'))
    expect(order).toEqual(row.children.map((_child, index) => `c${String(index)}`))
  })
})

/** A table row node: a label by default; `nodeType: "AppBar"` is an app bar (the field is not read on it). */
const pulledNodeOf = (row: { readonly nodeType?: string; readonly node: Raw }): Raw =>
  row.nodeType === 'AppBar' ? { id: 'pulled', type: 'AppBar', props: { title: lit('pulled'), showBack: false }, ...row.node } : textNode('pulled', row.node)

describe('pull: where the field is read and along which axis', () => {
  const nodesOf = (row: Table['pullReadCases'][number]): { readonly parent: Raw; readonly node: Raw } => {
    const node = pulledNodeOf(row)
    return { parent: { type: row.parent, props: row.parentProps, children: [node] }, node }
  }

  it.each(named(TABLE.pullReadCases))('function: %s', (_name, row) => {
    const { parent, node } = nodesOf(row)
    expect(effectivePull(node as never, parent as never) ?? null).toEqual(row.expect)
    expect(pullAxisOf(parent as never) !== undefined || row.expect === null).toBe(true)
  })

  it.each(named(TABLE.pullReadCases))('real screen: %s', (_name, row) => {
    const node = pulledNodeOf(row)
    const sibling = textNode('first')
    const ordered = row.nodeFirst === true ? [node, sibling] : [sibling, node]
    const parent = row.parent === 'Screen' ? undefined : parentNode(row.parent, row.parentProps, ordered)
    const document =
      row.parent === 'Screen'
        ? ({ schemaVersion: '9.11.0', documentId: 'offset-cases', name: 'cases', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: ordered } }] } as unknown as UiDocument)
        : documentOf([], parent)
    const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
    // The node place is itself or the row share wrapper: the negative margin lies on the outer element.
    const element = view.container.querySelector<HTMLElement>('[data-hl-node="pulled"]')!
    const holder = element.parentElement!
    const outer = holder.style.marginInlineStart !== '' || holder.style.marginBlockStart !== '' ? holder : element
    const key = row.expect?.axis === 'row' ? 'marginInlineStart' : 'marginBlockStart'
    if (row.expect === null) {
      expect(element.style.marginBlockStart).toBe('')
      expect(element.style.marginInlineStart).toBe('')
      expect(element.style.position).not.toBe('relative')
      return
    }
    expect(outer.style[key]).toBe(spacingOf(row.expect.by) === '0' ? '0px' : typeof row.expect.by === 'number' ? `-${String(row.expect.by)}px` : `calc(-${String(spx(row.expect.by))}px)`)
    // Across the axis nothing changed.
    expect(outer.style[row.expect.axis === 'row' ? 'marginBlockStart' : 'marginInlineStart']).toBe('')
  })

  it('weight wins: a pulled child without a weight next to weighted ones is legal, and with a weight the field is not read', () => {
    const row = parentNode('Row', {}, [textNode('weighted', { weight: 1, pull: 8 }), textNode('plain', { pull: 8 })])
    const view = render(<HotlayoutScreen document={documentOf([], row)} onReport={quiet} />)
    const weighted = view.container.querySelector<HTMLElement>('[data-hl-node="weighted"]')!
    expect(weighted.style.marginInlineStart).toBe('')
    expect(weighted.parentElement?.style.marginInlineStart ?? '').toBe('')
    expect(view.container.querySelector<HTMLElement>('[data-hl-node="plain"]')!.style.marginInlineStart).toBe('-8px')
  })

  it('the node field adds to its own margin on the same side: calc(own − pull)', () => {
    const own = textNode('c1', { pull: 'sm', style: { margin: { top: 'lg', bottom: 0, start: 0, end: 0 } } })
    const view = render(<HotlayoutScreen document={documentOf([], parentNode('Column', {}, [textNode('c0'), own]))} onReport={quiet} />)
    expect(view.container.querySelector<HTMLElement>('[data-hl-node="c1"]')!.style.marginBlockStart).toBe(`calc(${String(SPACE_PX.lg - SPACE_PX.sm)}px)`)
  })

  it('a pulled first body child lifts the body area: a negative margin on the body and an equal top padding inside', () => {
    const root = {
      id: 'root',
      type: 'Screen',
      props: { gap: 'md' },
      children: [{ id: 'bar', type: 'AppBar', props: { title: lit('T') } }, textNode('sheet', { pull: 'xl' })],
    }
    const document = { schemaVersion: '9.11.0', documentId: 'offset-cases', name: 'cases', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root }] } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} scroll="screen" onReport={quiet} />)
    const body = view.container.querySelector<HTMLElement>('[data-hl-zone="body"]')!
    // Overlap = pull − gap, not less than zero; the body is positioned, so it lies above the app bar.
    const overlap = `calc(${String(SPACE_PX.xl - SPACE_PX.md)}px)`
    expect(body.style.position).toBe('relative')
    expect(body.getAttribute('style')).toContain(`margin-block-start: calc(-${String(SPACE_PX.xl - SPACE_PX.md)}px)`)
    expect(body.getAttribute('style')).toContain(`padding-block-start: ${overlap}`)
    cleanup()
    // Without an app bar there is nothing to lift: into the top padding as before.
    const bare = { ...document, screens: [{ screenId: 'a', name: 'a', root: { ...root, children: [textNode('sheet', { pull: 'xl' })] } }] } as unknown as UiDocument
    const without = render(<HotlayoutScreen document={bare} scroll="screen" onReport={quiet} />)
    expect(without.container.querySelector<HTMLElement>('[data-hl-zone="body"]')!.style.position).toBe('')
  })
})

describe('pull: table documents; validator reference, the reader draws and does not crash', () => {
  it.each(named(TABLE.pullDocumentCases))('%s', (_name, row) => {
    const children = row.nodeFirst === true ? [pulledNodeOf(row), textNode('first')] : [textNode('first'), pulledNodeOf(row)]
    const reports: unknown[] = []
    const view = render(<HotlayoutScreen document={documentOf([], parentNode(row.parent, row.parent === 'Grid' ? { columns: 2, ...row.parentProps } : row.parentProps, children))} onReport={(report) => (report.kind === 'render-error' ? reports.push(report) : undefined)} />)
    expect(reports).toEqual([])
    expect(view.container.querySelector('[data-hl-node="pulled"]')).not.toBeNull()
  })
})
