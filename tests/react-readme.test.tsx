/**
 * The package README cannot go stale silently.
 *
 * A customer's frontend developer starts from the README and copies code from it. An example that
 * does not compile costs the first half hour spent working out who made the mistake, and the
 * package authors learn about it last. So every TypeScript block of the README is a REGION of a
 * file under `examples/` of the package, which `npm run web:typecheck` compiles against the public
 * entry of the package:
 *
 *     <!-- example: actions.tsx#navigation -->     <- in the README, before the code block
 *     // #region navigation ... // #endregion        <- in the example file
 *
 * The test compares them verbatim in BOTH directions: a block without a region, a block that
 * diverged from its region, and a region the README does not show all fail. Several examples are
 * also executed, because compiling does not say whether an example does what the text around it
 * promises.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { Catalog, RoutedRewards } from '../examples/actions'
import { Rewards } from '../examples/quick-start'
import { backLabelFor, fontsOf } from '../examples/helpers'
import { READER_ICON_SET_VERSION, READER_SCHEMA_VERSION, READER_THEME_VERSION } from '../src/index'
import type { ThemeContract, UiDocument, UiNode } from '../src/index'

afterEach(cleanup)

/** The directory of the package: a folder of the builder's repository, or the root of the package's own. */
const PACKAGE_DIR = join(__dirname, '../')
const EXAMPLES_DIR = join(PACKAGE_DIR, 'examples')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf8')
const CHANGELOG = readFileSync(join(PACKAGE_DIR, 'CHANGELOG.md'), 'utf8')

/** Regions of all example files: `file#region` to the text without the marker lines. */
function regions(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of readdirSync(EXAMPLES_DIR).filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.d.ts'))) {
    const source = readFileSync(join(EXAMPLES_DIR, file), 'utf8')
    for (const match of source.matchAll(/^\/\/ #region ([\w-]+)\n([\s\S]*?)^\/\/ #endregion$/gm)) found.set(`${file}#${match[1] ?? ''}`, (match[2] ?? '').trimEnd())
  }
  return found
}

interface Block {
  readonly language: string
  readonly marker: string | undefined
  readonly code: string
}

/** README code blocks together with the example marker on the line above. */
function blocks(): Block[] {
  return [...README.matchAll(/(?:<!-- example: ([^\s]+) -->\n)?```(\w*)\n([\s\S]*?)\n```/g)].map((match) => ({ marker: match[1], language: match[2] ?? '', code: match[3] ?? '' }))
}

describe('@hotlayout/react package README', () => {
  it('every TypeScript block is a verbatim region of a compiled example file', () => {
    const known = regions()
    const code = blocks().filter((block) => ['ts', 'tsx', 'js', 'jsx'].includes(block.language))
    expect(code.length).toBeGreaterThan(8)
    for (const block of code) {
      expect(block.marker, `block without an example marker:\n${block.code.slice(0, 120)}`).toBeDefined()
      const region = known.get(block.marker ?? '')
      expect(region, `region ${block.marker ?? ''} is not in ${EXAMPLES_DIR}`).toBeDefined()
      expect(block.code, `block ${block.marker ?? ''} diverged from the example file`).toBe(region)
    }
  })

  it('every example region is shown in the README: an abandoned example is stale too', () => {
    const shown = new Set(blocks().map((block) => block.marker))
    for (const name of regions().keys()) expect(shown.has(name), `the README does not show region ${name}`).toBe(true)
  })

  it('blocks without a language do not exist: the language decides whether a block is checked', () => {
    for (const block of blocks()) expect(block.language, block.code.slice(0, 80)).not.toBe('')
  })

  it('the props table names every component prop and no invented one', () => {
    const source = readFileSync(join(PACKAGE_DIR, 'src/HotlayoutScreen.tsx'), 'utf8')
    const body = /export interface HotlayoutScreenProps \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
    const props = [...body.matchAll(/^ {2}readonly (\w+)\??:/gm)].map((match) => match[1] ?? '')
    expect(props.length).toBeGreaterThan(15)
    const table = /### `<HotlayoutScreen>`\n([\s\S]*?)\n\n(?!\|)/.exec(README)?.[1] ?? ''
    const documented = [...table.matchAll(/^\| ((?:`\w+`(?:, )?)+) \|/gm)].flatMap((match) => [...(match[1] ?? '').matchAll(/`(\w+)`/g)].map((name) => name[1] ?? ''))
    expect(documented.sort()).toEqual([...props].sort())
  })

  it('the contract versions in the README and the changelog are the ones this build reads', () => {
    const schemaMajorMinor = READER_SCHEMA_VERSION.split('.').slice(0, 2).join('.')
    const themeMajorMinor = READER_THEME_VERSION.split('.').slice(0, 2).join('.')
    const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as { version: string; hotlayout: { schemaVersion: string; themeContractVersion: string; iconSetVersion: string } }
    expect(manifest.hotlayout).toEqual({ schemaVersion: READER_SCHEMA_VERSION, themeContractVersion: READER_THEME_VERSION, iconSetVersion: READER_ICON_SET_VERSION })
    for (const text of [README, CHANGELOG]) {
      expect(text).toContain(`${schemaMajorMinor}.x`)
      expect(text).toContain(`${themeMajorMinor}.x`)
      expect(text).toContain(`icon set ${READER_ICON_SET_VERSION}`)
    }
    // The changelog has an entry for the manifest version, and it is the first one after "Unreleased".
    expect(CHANGELOG).toMatch(new RegExp(`^## \\[${manifest.version.replaceAll('.', '\\.')}\\]`, 'm'))
  })

  it('the README installs the package by its published name, not from a tarball', () => {
    expect(README).toMatch(/npm install @hotlayout\/react(?!\S)/)
    expect(README).not.toMatch(/\.tgz|not published/)
  })
})

describe('README examples do what the text around them says', () => {
  const lit = (value: string) => ({ kind: 'literal', value }) as const
  const bound = (path: string, fallback: string) => ({ kind: 'binding', path, fallback }) as const
  const text = (id: string, content: object): UiNode => ({ id, type: 'Text', props: { content } })
  const button = (id: string, label: string, action: object): UiNode => ({ id, type: 'Button', props: { label: lit(label), variant: 'primary', action, fullWidth: false } })
  const layout: UiDocument = {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'catalog',
    name: 'Catalog',
    initialScreenId: 'list',
    entryPoints: { list: 'list', details: 'details' },
    screens: [
      {
        screenId: 'list',
        name: 'List',
        root: {
          id: 'list-root',
          type: 'Screen',
          props: {},
          children: [text('hello', bound('user.firstName', 'guest')), button('open-42', 'open-42', { type: 'navigate', params: { screenId: 'details', itemId: '42' } }), button('redeem', 'redeem', { type: 'submit' })],
        },
      },
      { screenId: 'details', name: 'Details', root: { id: 'details-root', type: 'Screen', props: {}, children: [text('name', bound('item.name', 'no record'))] } },
    ],
  }
  const theme = JSON.parse(readFileSync('contract/theme.json', 'utf8')) as { contract: ThemeContract }

  it('quick start: the document, theme and data give a screen with the bound value', () => {
    render(<Rewards layout={layout} theme={theme.contract} />)
    expect(screen.getByText('Ada')).toBeDefined()
  })

  /*
   * "List row to chosen item" (schema 9.2.0). The host does NOTHING for the details screen to show
   * the row record, and learns which record it is from the `source.record` of an action pressed on
   * the details screen itself.
   */
  it('record on the details screen: a row opens the details of ITS OWN record, and "redeem" tells the host which record it is', () => {
    const row: UiNode = { id: 'row', type: 'Button', props: { label: bound('item.name', 'row'), variant: 'ghost', action: { type: 'navigate', params: { screenId: 'details' } }, fullWidth: false } }
    const catalog: UiDocument = {
      ...layout,
      screens: [
        { screenId: 'list', name: 'List', root: { id: 'list-root', type: 'Screen', props: {}, children: [{ id: 'rows', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [row] }] } },
        { screenId: 'details', name: 'Details', root: { id: 'details-root', type: 'Screen', props: {}, children: [text('name', bound('item.name', 'no record')), button('redeem', 'redeem', { type: 'submit' }), button('back', 'back', { type: 'navigate.back' })] } },
      ],
    }
    const redeemed: string[] = []
    render(
      <Catalog
        layout={catalog}
        shared={{ 'user.firstName': 'Ada', 'item.name': 'from data' }}
        items={[
          { id: '41', name: 'Tea' },
          { id: '42', name: 'Coffee' },
        ]}
        onRedeem={(itemId) => redeemed.push(itemId)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Coffee' }))
    // The row record is stronger than `data`: the screen shows neither "from data" nor the fallback text.
    expect(screen.getByText('Coffee')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'redeem' }))
    expect(redeemed).toEqual(['42'])

    // Back and another row: another record.
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tea' }))
    fireEvent.click(screen.getByRole('button', { name: 'redeem' }))
    expect(redeemed).toEqual(['42', '41'])
  })

  it('host navigation: a navigation to a screen with a public name is cancelled, and a new entry opens it', () => {
    const view = render(<RoutedRewards layout={layout} entry="list" />)
    // `router` in the example is a declaration without a value: the example would throw a ReferenceError if it reached it,
    // so the second half is checked — the screen driven by the `entry` prop.
    view.rerender(<RoutedRewards layout={layout} entry="details" />)
    expect(screen.getByText('no record')).toBeDefined()
  })

  it('language: the device locale finds the translation by itself, and the example asks the same function about its own labels', () => {
    const translated: UiDocument = { ...layout, localization: { defaultLocale: 'en', locales: ['en', 'ar'], strings: { ar: { 'list/redeem/label': 'استبدال' } } } }
    expect(backLabelFor(translated, 'ar-EG')).toBe('رجوع')
    expect(backLabelFor(translated, 'de-DE')).toBe('Back')
    // No guessing the other way: a document with only `ar-SA` shows the source language for `ar-EG`.
    expect(backLabelFor({ ...translated, localization: { defaultLocale: 'en', locales: ['en', 'ar-SA'], strings: {} } }, 'ar-EG')).toBe('Back')
    // A document without localization names no language.
    expect(backLabelFor(layout, 'ar-EG')).toBe('Back')
  })

  it('fonts: the example names the families and weights of the built-in theme, the same ones the README states', () => {
    const fonts = fontsOf(theme.contract)
    const line = (role: 'body' | 'heading'): string => `${role} — ${fonts[role].family} ${fonts[role].weights.join(', ')}`
    expect(README).toContain(`// For the built-in theme: ${line('body')}; ${line('heading')}.`)
  })
})
