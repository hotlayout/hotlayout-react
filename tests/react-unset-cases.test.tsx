/**
 * THE EXPLICIT «NO» IN A LAYER OF WIDTH THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0) — the five groups of `contract/fixtures/adaptive/adaptive-cases.json`:
 * `unsetStyleCases`, `unsetStateCases`, `unsetPropsCases`, `unsetDocumentCases`, `unsetScreenCases`.
 *
 * The reference and the builder are checked by the builder's own test of the same table; this is the third reader. The
 * rows go through the very function the screen is resolved by (`nodeInWidthClass`) and then through a real
 * `HotlayoutScreen`: a node with the layers is drawn exactly as the node whose base is the expected style.
 * The document groups (what the builder publishes) say to the reader one thing: it draws every one of these
 * documents and does not fall.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { BUILT_IN_THEME_CONTRACT, HotlayoutScreen, resolveTheme } from '../src/index'
import type { UiDocument, UiNode } from '../src/index'
import { resolveNodeStyle } from '../src/style'
import { baseStyleInWidthClass, contentMaxWidthOf, effectivePropsOf, nodeInWidthClass, WIDTH_CLASS_LAYOUT, WIDTH_CLASSES } from '../src/width-class'
import type { WidthClass } from '../src/width-class'
import { unsetKeysOf, WIDTH_UNSET_LAYOUT, withoutUnset } from '../src/width-unset'

afterEach(cleanup)

type Json = Record<string, unknown>
interface Table {
  readonly unsetStyleCases: readonly { readonly name: string; readonly node: Json; readonly expected: Record<WidthClass, Json | null> }[]
  readonly unsetStateCases: readonly { readonly name: string; readonly node: Json; readonly widthClass: WidthClass; readonly met: boolean; readonly expected: Json }[]
  readonly unsetPropsCases: readonly { readonly name: string; readonly node: Json; readonly prop: string; readonly expected: Record<WidthClass, unknown> }[]
  readonly unsetDocumentCases: readonly { readonly name: string; readonly node: Json; readonly schema: boolean; readonly codes: readonly string[] }[]
  readonly unsetScreenCases: readonly { readonly name: string; readonly root: Json; readonly schema: boolean; readonly codes: readonly string[] }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/adaptive/adaptive-cases.json', 'utf8')) as Table
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as { readonly 'x-style': { readonly layout: Record<string, unknown> } }
const theme = resolveTheme(BUILT_IN_THEME_CONTRACT, undefined).theme

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const raw = (fields: object, type = 'Container', id = 'node'): UiNode => ({ id, type, props: {}, ...fields }) as unknown as UiNode
const data = (met: boolean): Record<string, unknown> => ({ 'task.completed': met })

function documentOf(root: UiNode): UiDocument {
  return { schemaVersion: '9.19.0', documentId: 'unset', name: 'unset', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root }] } as unknown as UiDocument
}

function view(root: UiNode, widthClass: WidthClass, values: Record<string, unknown> = {}): ReturnType<typeof render> {
  return render(<HotlayoutScreen document={documentOf(root)} initialWidthClass={widthClass} data={values} onReport={() => undefined} />)
}

const screenOf = (children: readonly UiNode[], extra: object = {}): UiNode => ({ id: 'root', type: 'Screen', props: { gap: 'none' }, ...extra, children }) as unknown as UiNode
const hostEl = (container: HTMLElement, id: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
  if (found === null) throw new Error(`no node ${id}`)
  return found
}

describe('the explicit «no» in a layer: the table and the mirrored blocks', () => {
  it('the table is on the place: the rows are counted, the names do not repeat', () => {
    expect([TABLE.unsetStyleCases.length, TABLE.unsetStateCases.length, TABLE.unsetPropsCases.length, TABLE.unsetDocumentCases.length, TABLE.unsetScreenCases.length]).toEqual([14, 3, 7, 12, 5])
    for (const group of [TABLE.unsetStyleCases, TABLE.unsetStateCases, TABLE.unsetPropsCases, TABLE.unsetDocumentCases, TABLE.unsetScreenCases]) expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })

  it('the block `widthUnset` is mirrored whole; the block `widthClass` is the one of 9.18.0 (the new key lives in the neighbour block)', () => {
    expect(WIDTH_UNSET_LAYOUT).toEqual(ARTIFACT['x-style'].layout.widthUnset)
    const widthClass = ARTIFACT['x-style'].layout.widthClass as { readonly cases?: unknown }
    const mirrored = Object.fromEntries(Object.entries(widthClass).filter(([key]) => key !== 'cases'))
    expect(WIDTH_CLASS_LAYOUT).toEqual(mirrored)
  })
})

describe('unsetStyleCases: the style of a node in every class', () => {
  it.each(named(TABLE.unsetStyleCases))('%s', (_name, row) => {
    const node = raw(row.node)
    for (const widthClass of WIDTH_CLASSES) expect(baseStyleInWidthClass(node, widthClass) ?? null, widthClass).toEqual(row.expected[widthClass])
  })

  it.each(named(TABLE.unsetStyleCases))('on a real screen the node with the layers is drawn as the node with the expected base: %s', (_name, row) => {
    for (const widthClass of WIDTH_CLASSES) {
      const withLayers = view(screenOf([raw({ ...row.node, id: 'x' }, 'Container', 'x')]), widthClass)
      const got = hostEl(withLayers.container, 'x').outerHTML
      withLayers.unmount()
      const expected = row.expected[widthClass]
      const plain = view(screenOf([raw({ ...(expected === null ? {} : { style: expected }) }, 'Container', 'x')]), 'compact')
      expect(got, widthClass).toBe(hostEl(plain.container, 'x').outerHTML)
      plain.unmount()
    }
  })

  it('the resolved node carries neither `styleOn` nor `propsOn` and resolves to itself the second time (the rule of drawing knows nothing of `unset`)', () => {
    for (const row of TABLE.unsetStyleCases) {
      for (const widthClass of ['medium', 'expanded'] as const) {
        const resolved = nodeInWidthClass(raw(row.node), widthClass)
        expect('styleOn' in resolved, row.name).toBe(false)
        expect(nodeInWidthClass(resolved, widthClass), row.name).toBe(resolved)
      }
    }
  })

  it('on the compact class the node is itself — the base IS the phone', () => {
    const node = raw({ style: { padding: 'md' }, styleOn: { unset: { expanded: ['padding'] } } })
    expect(nodeInWidthClass(node, 'compact')).toBe(node)
  })
})

describe('unsetStateCases: a state lies on top and may name the removed field', () => {
  it.each(named(TABLE.unsetStateCases))('%s', (_name, row) => {
    const resolved = nodeInWidthClass(raw(row.node), row.widthClass)
    expect(resolveNodeStyle(resolved, data(row.met), theme) ?? null).toEqual(row.expected)
  })
})

describe('unsetPropsCases: the properties of a screen in every class', () => {
  it.each(named(TABLE.unsetPropsCases))('%s', (_name, row) => {
    const node = raw(row.node, String(row.node.type))
    for (const widthClass of WIDTH_CLASSES) {
      const props = effectivePropsOf(node, widthClass)
      const value = row.prop === 'contentMaxWidth' ? contentMaxWidthOf(props) : props[row.prop]
      expect(value ?? null, widthClass).toEqual(row.expected[widthClass])
    }
  })

  it('a layer of properties removes nothing when the shape is wrong, and the node is itself when nothing is removed', () => {
    const base = raw({ props: { contentMaxWidth: 720 }, propsOn: { unset: { expanded: 'contentMaxWidth' } } }, 'Screen')
    expect(effectivePropsOf(base, 'expanded')).toBe(base.props)
    const gap = raw({ props: { gap: 'lg' }, propsOn: { unset: { expanded: ['gap'] } } }, 'Column')
    expect(effectivePropsOf(gap, 'expanded')).toBe(gap.props)
  })
})

describe('the helpers read tolerantly', () => {
  it('a wrapper or a list of the wrong form removes nothing, a non-string is skipped', () => {
    for (const carrier of [undefined, null, 5, 'unset', [], { unset: 5 }, { unset: [] }, { unset: { expanded: 'background' } }, { unset: { expanded: 5 } }]) expect(unsetKeysOf(carrier, 'expanded')).toEqual([])
    expect(unsetKeysOf({ unset: { expanded: ['background', 3, null, 'padding'] } }, 'expanded')).toEqual(['background', 'padding'])
    expect(unsetKeysOf({ unset: { medium: ['background'] } }, 'expanded')).toEqual([])
  })

  it('a record without the keys is the same object; everything removed is «no record»', () => {
    const record = { a: 1 }
    expect(withoutUnset(record, ['b'])).toBe(record)
    expect(withoutUnset(record, [])).toBe(record)
    expect(withoutUnset(record, ['a'])).toBeUndefined()
    expect(withoutUnset({ a: 1, b: 2 }, ['a'])).toEqual({ b: 2 })
  })

  it('a prototype name is not a key of the record', () => {
    expect(withoutUnset({ a: 1 }, ['constructor', '__proto__', 'toString'])).toEqual({ a: 1 })
  })
})

describe('unsetDocumentCases and unsetScreenCases: the reader draws every document and does not fall', () => {
  it.each(named(TABLE.unsetDocumentCases))('%s', (_name, row) => {
    for (const widthClass of WIDTH_CLASSES) {
      const { container, unmount } = view(screenOf([raw({ ...row.node, id: 'x' }, String(row.node.type ?? 'Container'), 'x')]), widthClass)
      expect(container.querySelector('[data-hl-node="root"]'), widthClass).not.toBeNull()
      unmount()
    }
  })

  it.each(named(TABLE.unsetScreenCases))('%s', (_name, row) => {
    for (const widthClass of WIDTH_CLASSES) {
      const { container, unmount } = view({ id: 'root', type: 'Screen', ...row.root, children: [] } as unknown as UiNode, widthClass)
      expect(container.querySelector('[data-hl-node="root"]'), widthClass).not.toBeNull()
      unmount()
    }
  })

  it('the limit of the content width removed on expanded: the content is no longer a column of the number', () => {
    const root = (value: number | undefined, unset: boolean): UiNode =>
      ({ id: 'root', type: 'Screen', props: { gap: 'none', ...(value === undefined ? {} : { contentMaxWidth: value }) }, ...(unset ? { propsOn: { unset: { expanded: ['contentMaxWidth'] } } } : {}), children: [] }) as unknown as UiNode
    const limited = view(root(720, false), 'expanded')
    const removed = view(root(720, true), 'expanded')
    const without = view(root(undefined, false), 'expanded')
    expect(hostEl(removed.container, 'root').outerHTML).toBe(hostEl(without.container, 'root').outerHTML)
    expect(hostEl(limited.container, 'root').outerHTML).not.toBe(hostEl(removed.container, 'root').outerHTML)
  })
})
