/**
 * FREE COMPOSITION THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0): all six groups of
 * `contract/fixtures/composition/composition-cases.json`: `nestingCases`, `depthCases`,
 * `documentCases`, `pressableCases`, `pressCases`, `nameCases`.
 *
 * The reference implementation is checked against the same table elsewhere; this is
 * the third reader. The reader does not check which type may stand in which, nor the depth, so
 * the first three groups are checked as «the reader draws every one of
 * these trees and the node is on the screen». The last three go through a real
 * `HotlayoutScreen` with real clicks: who is pressable, who takes the press, what the card is
 * called. jsdom has no layout, so a press lands on the box of the named node.
 *
 * NO ROW IS SKIPPED. The one thing a row cannot say about a reader is the accessible name of a
 * card from the text of a control inside it: the contract does not promise it
 * (`textOfControlsInside`), and a collapsed accordion draws no body — those rows are checked
 * for what they DO say (the label first, the descriptions, the texts that are drawn).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { COMPOSITION_RULES } from '../src/render/press-host'
import { HotlayoutScreen } from '../src/index'
import type { HotlayoutAction, HotlayoutReport, UiDocument } from '../src/index'

afterEach(cleanup)

interface Tree {
  readonly id: string
  readonly type: string
  readonly props?: Record<string, unknown>
  readonly children?: readonly Tree[]
}
interface Table {
  readonly maxDepth: number
  readonly nestingCases: readonly { readonly name: string; readonly parent: string; readonly child: string; readonly allowed: boolean }[]
  readonly depthCases: readonly { readonly name: string; readonly chain: readonly string[]; readonly leaf: string; readonly depth: number; readonly valid: boolean; readonly schema: boolean }[]
  readonly documentCases: readonly { readonly name: string; readonly children: readonly Tree[]; readonly schema: boolean; readonly codes: readonly string[] }[]
  readonly pressableCases: readonly { readonly name: string; readonly node: Tree; readonly pressable: boolean; readonly ownsPress: boolean; readonly acts: boolean }[]
  readonly pressCases: readonly {
    readonly name: string
    readonly tree: Tree
    readonly press: string
    readonly receiver: string | null
    readonly runs: string | null
    readonly disabled?: readonly string[]
    readonly instances?: number
    readonly instance?: number
  }[]
  readonly nameCases: readonly { readonly name: string; readonly tree: Tree; readonly hasName: boolean; readonly startsWith: string | null; readonly heard: readonly string[]; readonly described?: readonly string[] }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/composition/composition-cases.json', 'utf8')) as Table
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as { readonly 'x-style': { readonly layout: Record<string, unknown> }; readonly 'x-accessibleName': { readonly silentCharacters: string; readonly flags: string } }
/** The class of characters that say nothing to a person who listens (`x-accessibleName`), as the artifact writes it. */
const SILENT_CHARACTERS = new RegExp(ARTIFACT['x-accessibleName'].silentCharacters, `${ARTIFACT['x-accessibleName'].flags}g`)

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const lit = (value: string): Record<string, unknown> => ({ kind: 'literal', value })
const quiet = (): undefined => undefined

/** A node of any type with the props that type needs to be drawn at all. */
function nodeOf(type: string, id: string, children: readonly Tree[] = []): Tree {
  const props: Record<string, Record<string, unknown>> = {
    Text: { content: lit(id) },
    Icon: { name: 'gift' },
    Tab: { title: lit(id) },
    Accordion: { title: lit(id), initiallyExpanded: true },
    Repeater: { source: 'items', item: 'item' },
    ChoiceGroup: { value: { kind: 'binding', path: 'user.firstName', fallback: '' } },
  }
  return { id, type, props: props[type] ?? {}, children }
}

function documentOf(children: readonly Tree[]): UiDocument {
  return {
    schemaVersion: '9.19.0',
    documentId: 'composition-case',
    name: 'composition',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }, { screenId: 'details', name: 'Details', root: { id: 'root-d', type: 'Screen', props: {}, children: [] } }],
  } as unknown as UiDocument
}

interface Seen {
  /** Every action that was executed: handed to the host (`onAction`) or performed by the reader (`onNavigate`). */
  readonly calls: { readonly action: HotlayoutAction; readonly nodeId: string; readonly record?: Record<string, unknown> | undefined }[]
  /** Every analytics event of a press. */
  readonly tracks: string[]
  readonly reports: HotlayoutReport[]
}

function show(children: readonly Tree[], options: { readonly data?: Record<string, unknown>; readonly collections?: Record<string, readonly Record<string, unknown>[]> } = {}): { readonly container: HTMLElement; readonly seen: Seen } {
  const seen: Seen = { calls: [], tracks: [], reports: [] }
  const view = render(
    <HotlayoutScreen
      document={documentOf(children)}
      data={options.data}
      collections={options.collections as never}
      onAction={(action, source) => seen.calls.push({ action, nodeId: source.nodeId, record: source.record as Record<string, unknown> | undefined })}
      onNavigate={(event) => {
        seen.calls.push({ action: event.action, nodeId: event.source.nodeId, record: event.source.record as Record<string, unknown> | undefined })
        return undefined
      }}
      onTrack={(_event, source) => seen.tracks.push(source.nodeId)}
      onReport={(report) => seen.reports.push(report)}
    />,
  )
  return { container: view.container, seen }
}

const element = (container: HTMLElement, id: string, index = 0): HTMLElement => {
  const found = container.querySelectorAll<HTMLElement>(`[data-hl-node="${id}"]`)[index]
  if (found === undefined) throw new Error(`no node ${id}`)
  return found
}

/** The rows of the name name only the DESCRIPTION of a picture; a picture without a source draws nothing, so one is added (an asset: the placeholder is drawn and is the picture). */
function withPictureSources(tree: Tree): Tree {
  const props = tree.type === 'Image' && tree.props?.source === undefined ? { ...tree.props, source: { kind: 'asset', asset: 'logo' } } : tree.props
  return { ...tree, ...(props === undefined ? {} : { props }), ...(tree.children === undefined ? {} : { children: tree.children.map(withPictureSources) }) }
}

/** A deep tree: the chain of containers around the leaf, the last of the chain holds the leaf. */
function chainOf(chain: readonly string[], leaf: string): Tree {
  let inner: Tree = nodeOf(leaf, 'leaf')
  for (let index = chain.length - 1; index >= 0; index -= 1) inner = nodeOf(chain[index] ?? 'Column', `c${String(index)}`, [inner])
  return inner
}

describe('free composition: the table', () => {
  it('has as many rows as were written by hand', () => {
    expect([TABLE.nestingCases.length, TABLE.depthCases.length, TABLE.documentCases.length, TABLE.pressableCases.length, TABLE.pressCases.length, TABLE.nameCases.length]).toEqual([20, 9, 16, 19, 21, 35])
    expect(TABLE.maxDepth).toBe(8)
    for (const group of [TABLE.nestingCases, TABLE.depthCases, TABLE.documentCases, TABLE.pressableCases, TABLE.pressCases, TABLE.nameCases]) expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })

  it('the block of the package is the block `composition` of the artifact (the part a reader needs), key for key', () => {
    const artifact = ARTIFACT['x-style'].layout.composition as Record<string, unknown>
    expect(COMPOSITION_RULES.nesting).toEqual(artifact.nesting)
    expect(COMPOSITION_RULES.depth).toEqual(artifact.depth)
    expect(COMPOSITION_RULES.pressable).toEqual(artifact.pressable)
    expect(COMPOSITION_RULES.cases).toBe(artifact.cases)
  })
})

describe('type in type and depth: the reader draws what it is given', () => {
  it.each(named(TABLE.nestingCases))('%s', (_name, row) => {
    // A container that cannot hold the child by the registry is not published — a reader still draws it.
    const inner = nodeOf(row.parent, 'parent', [nodeOf(row.child, 'child')])
    // A tab is a panel of tabs: on its own it has no strip to stand in.
    const { container, seen } = show([row.parent === 'Tab' ? nodeOf('Tabs', 'tabs', [inner]) : inner], { collections: { items: [{ id: 'a', name: 'A' }] } })
    expect(element(container, 'parent')).not.toBeNull()
    // A list draws its template once per record and has no box of its own, and a text draws no children: for those two shapes there is nothing to look for, and no error is the answer.
    if (row.parent !== 'Text' && row.child !== 'Repeater') expect(container.querySelector('[data-hl-node="child"]')).not.toBeNull()
    expect(seen.reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })

  it.each(named(TABLE.depthCases))('%s', (_name, row) => {
    const { container, seen } = show([chainOf(row.chain, row.leaf)], { collections: { items: [{ id: 'a', name: 'A' }] } })
    // The level of the leaf counts the root as 0; the reader draws the tree whether the builder publishes it or not.
    expect(container.querySelector('[data-hl-node="leaf"]')).not.toBeNull()
    expect(row.chain.length + 1).toBe(row.depth)
    expect(seen.reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })

  it.each(named(TABLE.documentCases))('%s', (_name, row) => {
    const { container, seen } = show(row.children, { collections: { items: [{ id: 'a', name: 'A' }] } })
    const ids: string[] = []
    const walk = (nodes: readonly Tree[]): void => {
      for (const node of nodes) {
        ids.push(node.id)
        walk(node.children ?? [])
      }
    }
    walk(row.children)
    // Every node of the document is drawn.
    for (const id of ids) expect(container.querySelector(`[data-hl-node="${id}"]`), id).not.toBeNull()
    expect(seen.reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })

  it('a tree deeper than the guard of the reader is refused as a screen, not a crash', () => {
    const deep = chainOf(Array.from({ length: 200 }, () => 'Column'), 'Text')
    const { container } = show([deep])
    expect(container.querySelector('[data-hl-node="leaf"]')).toBeNull()
    expect(container.textContent).toContain('was not rendered')
  })
})

/** The tree as the press tests draw it: accordions open (a body that is not drawn takes no press), an option of a choice inside its group. */
function prepared(tree: Tree): Tree {
  const children = (tree.children ?? []).map(prepared)
  const props = tree.type === 'Accordion' ? { ...tree.props, initiallyExpanded: true } : tree.props
  return { ...tree, ...(props === undefined ? {} : { props }), children }
}
/** An action `none` without analytics: it runs, and nothing reaches the host. */
function isInert(tree: Tree | undefined): boolean {
  const action = tree?.props?.action as { type?: string; track?: unknown } | undefined
  return action?.type === 'none' && action.track === undefined
}
function find(tree: Tree, id: string): Tree | undefined {
  if (tree.id === id) return tree
  for (const child of tree.children ?? []) {
    const found = find(child, id)
    if (found !== undefined) return found
  }
  return undefined
}
const isOption = (tree: Tree): boolean => tree.type === 'ListTile' && (tree.props?.trailing as { kind?: string } | undefined)?.kind === 'radio'
const grouped = (tree: Tree): Tree => (isOption(tree) ? { id: `${tree.id}-group`, type: 'ChoiceGroup', props: { value: { kind: 'binding', path: 'user.firstName', fallback: '' } }, children: [tree] } : tree)
/** The point of a press on a node: widgets that own a control (a strip of tabs, a header of an accordion) take it on that control, everything else on its box. */
function pointOf(container: HTMLElement, id: string, index: number): HTMLElement {
  const box = element(container, id, index)
  const type = box.getAttribute('data-hl-type')
  if (type === 'Accordion') return box.querySelector<HTMLElement>('button')!
  if (type === 'Tabs') return box.querySelector<HTMLElement>('[role="tablist"]')!
  return box
}

describe('who is pressable and who takes a press', () => {
  /** A card around the node: the press that is not the card's must not reach it. */
  const card = (inner: Tree): Tree => ({ id: 'outer', type: 'Container', props: { action: { type: 'submit' } }, children: [inner] })

  it.each(named(TABLE.pressableCases))('%s', (_name, row) => {
    const alone = show([prepared(grouped(row.node))])
    const own = element(alone.container, row.node.id)
    // `pressable`: a container with a live action is a button with a focus of its own; a leaf is not marked.
    expect(own.hasAttribute('data-hl-press')).toBe(row.pressable)
    expect(own.getAttribute('role') === 'button' || own.tagName === 'BUTTON').toBe(row.acts)
    cleanup()

    // `ownsPress`: a press on a control of the node is not the press of a card around it. The node's own control is the first control element inside it (or the node itself).
    const wrapped = show([card(prepared(grouped({ ...row.node, id: 'inner' })))], { data: { 'user.isPremium': true } })
    const inner = element(wrapped.container, 'inner')
    const control = inner.matches('button, input, [role="button"], [role="switch"]') ? inner : inner.querySelector<HTMLElement>('button, input, textarea, [role="button"], [role="radio"], [role="switch"], [role="tablist"], [role="tab"]')
    const target = row.ownsPress ? (control ?? inner) : inner
    fireEvent.click(target)
    const toCard = wrapped.seen.calls.filter((call) => call.nodeId === 'outer').length
    expect(toCard === 0, `card got ${String(toCard)} presses`).toBe(row.ownsPress)
  })

  it.each(named(TABLE.pressCases))('%s', (_name, row) => {
    const template = row.instances !== undefined
    const items = Array.from({ length: row.instances ?? 1 }, (_, index) => ({ id: `i${String(index)}`, name: `Item ${String(index)}` }))
    const children: Tree[] = template ? [{ id: 'list', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [row.tree] }] : [row.tree]
    const data = { 'user.isPremium': (row.disabled ?? []).length === 0 }
    const { container, seen } = show(children.map(prepared), { data, ...(template ? { collections: { items } } : {}) })
    fireEvent.click(pointOf(container, row.press, row.instance ?? 0))
    // What ran: an executed action, or the event of a node whose action is `none` (nothing reaches the host from it).
    const ran = [...new Set([...seen.calls.map((call) => call.nodeId), ...seen.tracks])]
    const nothing = row.runs === null || isInert(find(row.tree, row.runs))
    expect(ran).toEqual(nothing ? [] : [row.runs])
    // The ancestors of the receiver get nothing: at most one action (an action `none` with analytics hands none to the host).
    expect(seen.calls.length).toBe(nothing || seen.calls.length === 0 ? 0 : 1)
    if (template && !nothing && seen.calls.length > 0) expect(seen.calls[0]?.record).toEqual({ 'item.id': `i${String(row.instance)}`, 'item.name': `Item ${String(row.instance)}` })
  })

  it('an action `none` with analytics is a card: the event goes before the (absent) action, once', () => {
    const tracked: Tree = { id: 'card', type: 'Container', props: { action: { type: 'none', track: { event: 'card_tap' } } }, children: [nodeOf('Text', 't')] }
    const tracks: unknown[] = []
    const view = render(<HotlayoutScreen document={documentOf([tracked])} onTrack={(event) => tracks.push(event)} onReport={quiet} />)
    fireEvent.click(element(view.container, 't'))
    expect(tracks).toHaveLength(1)
  })

  it('a track of a wrong shape is ignored whole: the card with `none` stays plain', () => {
    const broken: Tree = { id: 'card', type: 'Container', props: { action: { type: 'none', track: { event: 'bad event!' } } }, children: [nodeOf('Text', 't')] }
    const { container } = show([broken])
    expect(element(container, 'card').hasAttribute('data-hl-press')).toBe(false)
  })
})

describe('keyboard and focus of a card', () => {
  const card: Tree = { id: 'card', type: 'Container', props: { action: { type: 'submit' }, label: lit('Open') }, children: [nodeOf('Text', 't'), { id: 'go', type: 'Button', props: { label: lit('Go'), action: { type: 'share' } } }] }

  it('is a button in the order of focus before the controls inside it; Enter and Space press, a held key presses once', () => {
    const { container, seen } = show([card])
    const root = element(container, 'card')
    expect(root.getAttribute('role')).toBe('button')
    expect(root.tabIndex).toBe(0)
    const focusable = [...container.querySelectorAll<HTMLElement>('[tabindex="0"], button')]
    expect(focusable.indexOf(root)).toBeLessThan(focusable.indexOf(element(container, 'go')))
    fireEvent.keyDown(root, { key: 'Enter' })
    fireEvent.keyDown(root, { key: ' ' })
    expect(seen.calls.map((call) => call.nodeId)).toEqual(['card', 'card'])
    fireEvent.keyDown(root, { key: 'Enter', repeat: true })
    fireEvent.keyDown(root, { key: 'Enter', repeat: true })
    expect(seen.calls).toHaveLength(2)
    // Another key does nothing.
    fireEvent.keyDown(root, { key: 'a' })
    expect(seen.calls).toHaveLength(2)
  })

  it('a key on a control inside is that control\'s, never the card\'s', () => {
    const { container, seen } = show([card])
    fireEvent.keyDown(element(container, 'go'), { key: 'Enter' })
    expect(seen.calls.filter((call) => call.nodeId === 'card')).toEqual([])
  })

  it('has no pressed state, no disabled state and no minimum target: the class is the focus ring only', () => {
    const { container } = show([card])
    const root = element(container, 'card')
    expect(root.className).toBe('hl-focus')
    expect(root.getAttribute('aria-disabled')).toBeNull()
    expect(root.style.minHeight).toBe('')
    expect(root.style.minWidth).toBe('')
  })
})

/* ------------------------------- the name ------------------------------- */

/** The accessible name of an element the way the browsers compose it from content (enough for these trees). */
function nameOf(element: Element): string {
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return
    const label = node.getAttribute('aria-label')
    if (label !== null && node !== element) {
      parts.push(label)
      return
    }
    if (node.tagName === 'IMG') {
      parts.push(node.getAttribute('alt') ?? '')
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  for (const child of element.childNodes) walk(child)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

describe('the name of a card', () => {
  it.each(named(TABLE.nameCases))('%s', (_name, row) => {
    const { container } = show([withPictureSources(row.tree)], { data: {}, collections: { items: [] } })
    const card = element(container, row.tree.id)
    const name = nameOf(card)
    expect(card.getAttribute('role')).toBe('button')
    // The label is the hidden text node that comes FIRST, not `aria-label` (which would replace the content).
    expect(card.getAttribute('aria-label')).toBeNull()
    if (row.startsWith !== null) expect(name.startsWith(row.startsWith), `«${name}»`).toBe(true)
    for (const heard of row.heard) expect(name).toContain(heard)
    for (const description of row.described ?? []) expect(name).toContain(description)
    // `hasName`, whole (9.19.0): the card is heard iff something is left of its name once the silent characters of the
    // artifact are removed. A button, an accordion and a strip of tabs are controls of their own: whether their text goes into the name of the card is not promised (`textOfControlsInside`).
    if (!/"type":"(Accordion|Tabs|Button|IconButton)"/.test(JSON.stringify(row.tree))) expect(name.replace(SILENT_CHARACTERS, '') !== '', `«${name}»`).toBe(row.hasName)
    const label = (row.tree.props?.label as { value?: string } | undefined)?.value
    if (label !== undefined && label.trim() !== '') expect(card.firstElementChild?.getAttribute('data-hl-press-label')).toBe('')
    // A card whose only text is the template of a list from data, or the header of an accordion or a strip of tabs, is not named by it.
    if (!row.hasName && row.heard.length === 0 && label === undefined) expect(card.querySelector('[data-hl-press-label]')).toBeNull()
  })

  it('a carousel row that is a card carries the hidden label first, stays a card (role «button») and a list without an action stays a list', () => {
    const cards = ['a', 'b'].map((id): Tree => ({ id, type: 'Container', props: {}, children: [{ id: `${id}-t`, type: 'Text', props: { content: lit(`Card ${id}`) } }] }))
    const row = (props: Record<string, unknown>): Tree => ({ id: 'row', type: 'Row', props: { gap: 'sm', align: 'start', justify: 'start', wrap: false, scrollable: true, carousel: { perView: 1.2 }, ...props }, children: cards })
    const card = element(show([row({ action: { type: 'submit' }, label: lit('Open gallery') })]).container, 'row')
    expect(card.getAttribute('role')).toBe('button')
    expect(card.firstElementChild?.getAttribute('data-hl-press-label')).toBe('')
    expect(card.firstElementChild?.textContent).toBe('Open gallery')
    expect(nameOf(card).startsWith('Open gallery')).toBe(true)
    cleanup()
    const plain = element(show([row({})]).container, 'row')
    expect(plain.getAttribute('role')).toBe('list')
    expect(plain.querySelector('[data-hl-press-label]')).toBeNull()
  })

  it('a label made of spaces writes no hidden text: it is not a name', () => {
    const tree: Tree = { id: 'card', type: 'Container', props: { action: { type: 'submit' }, label: lit('   ') }, children: [nodeOf('Icon', 'i')] }
    const { container } = show([tree])
    expect(container.querySelector('[data-hl-press-label]')).toBeNull()
  })

  it('the label obeys the rule of shown text: the runs of spaces collapse and the edges are cut', () => {
    const tree: Tree = { id: 'card', type: 'Container', props: { action: { type: 'submit' }, label: lit('  Open   the   quest ') }, children: [nodeOf('Icon', 'i')] }
    const { container } = show([tree])
    expect(container.querySelector('[data-hl-press-label]')?.textContent).toBe('Open the quest')
  })
})
