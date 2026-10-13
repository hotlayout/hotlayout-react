/**
 * Tests of the PACKAGE as a whole — what a customer app receives — through the public entry.
 *
 * The contract rules node by node (box model, states, inheritance, theme fallbacks) are covered by
 * the builder's `web-example.test.tsx`, which draws with the same code. The question here is different:
 * does the package work as a unit? Every contract fixture is drawn; the compatibility policy is
 * checked against the ARTIFACT, not against our idea of it; actions and the screen stack;
 * right-to-left writing; and the contract mirrors inside the package (built-in theme, icon list,
 * versions) must not lag behind `contract/*.json`.
 *
 * The tests import from the builder's `src/` ONLY to compare mirrors. The package itself imports
 * nothing from there, which is also verified here.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as publicApi from './index'
import {
  BUILT_IN_THEME_CONTRACT,
  checkDocumentVersion,
  HOTLAYOUT_CSS,
  HotlayoutLoadError,
  HotlayoutScreen,
  loadDocument,
  loadTheme,
  READER_ICON_SET_VERSION,
  READER_SCHEMA_VERSION,
  READER_THEME_VERSION,
  resolveTheme,
} from './index'
import type { HotlayoutAction, HotlayoutReport, NavigationEvent, ScreenInfo, ThemeContract, UiDocument, UiNode } from './index'
import { ICON_BODIES, ICON_GRID, ICON_SET_VERSION } from './icon-set'
import { ASSET_PLACEHOLDERS, iconMask, MIRRORED_ICONS } from './icons'
import { COUNTABLE_FORMATS, CURRENCY_FORMAT, DATE_CALENDAR, DATE_CALENDAR_CHECK, DATE_TIME_PATTERN, NUMBER_ROUNDING, DAYS_UNTIL, NUMBER_FORMAT, READER_BINDING_FORMATS } from './binding-format'
import { MIN_TOUCH_TARGET, PRESSABLE_CLASS } from './styles'
import { MAX_TEMPLATE_VALUES, PLURAL_CATEGORIES, PLURAL_NUMBER, pluralFormSubpath, TEMPLATE_TEXT_SUBPATH, TEMPLATE_VALUE_NAME_PATTERN } from './text-template'
import { contractFile, packageFile, SRC_DIR } from '../test-support/paths'

afterEach(cleanup)

const FIXTURES_DIR = contractFile('fixtures')
// The type parameter states what the file holds at the call site; otherwise every call would carry its own `as`.
 
const json = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const SCHEMA = json<{
  'x-schemaVersion': string
  'x-mirroredIcons': string[]
  'x-compatibility': { policy: Record<string, unknown>; features: Record<string, string> }
  'x-template': {
    placeholder: string
    valueNamePattern: string
    maxValues: number
    pluralCategories: string[]
    translationKeys: { template: string; pluralForm: string }
    number: unknown
    currency: unknown
    daysUntil: unknown
    dateTimePattern: string
    countableFormats: string[]
    pluralNumber: unknown
    dateCalendar: string
    dateCalendarCheck: unknown
    rounding: unknown
    cases: string
  }
  $defs: Record<string, { enum?: string[] }>
}>(contractFile('screen-schema.json'))
const DATA_ARTIFACT = json<{ 'x-sampleNow': string; contract: { paths: { path: string; sampleValue: unknown }[]; collections: { path: string; itemPrefix: string; samples?: Record<string, unknown>[] }[] } }>(
  contractFile('data-contract.json'),
)
const THEME_ARTIFACT = json<{ 'x-themeContractVersion': string; 'x-compatibility': { policy: Record<string, unknown> }; contract: ThemeContract }>(contractFile('theme.json'))
const ICONS_ARTIFACT = json<{ iconSetVersion: string; grid: Record<string, unknown>; icons: Record<string, string> }>(contractFile('icons.json'))
const POLICY = SCHEMA['x-compatibility'].policy
const THEME_POLICY = THEME_ARTIFACT['x-compatibility'].policy

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
const fixture = (name: string): UiDocument => json<UiDocument>(join(FIXTURES_DIR, `${name}.json`))

/** The theme of a fixture if it has its own (`contract/fixtures/themes/`), otherwise the theme artifact. */
function themeOf(name: string): ThemeContract {
  const own = join(FIXTURES_DIR, 'themes', `${name.replace(/-screens?$/, '')}-theme.json`)
  try {
    return json<ThemeContract>(own)
  } catch {
    return THEME_ARTIFACT.contract
  }
}

const lit = (value: string) => ({ kind: 'literal', value }) as const
const text = (id: string, value: string, extra: Partial<UiNode> = {}): UiNode => ({ id, type: 'Text', props: { content: lit(value) }, ...extra })
const button = (id: string, label: string, action: HotlayoutAction): UiNode => ({ id, type: 'Button', props: { label: lit(label), variant: 'primary', action, fullWidth: false } })
const screenRoot = (id: string, children: readonly UiNode[]): UiNode => ({ id, type: 'Screen', props: {}, children })

function documentOf(screens: UiDocument['screens'], extra: Partial<UiDocument> = {}): UiDocument {
  return { schemaVersion: READER_SCHEMA_VERSION, documentId: 'doc', name: 'Doc', initialScreenId: screens[0]?.screenId ?? '', screens, ...extra }
}

/** Three screens: page, page, modal; each has buttons for every kind of action. */
function flowDocument(): UiDocument {
  return documentOf(
    [
      {
        screenId: 'a',
        name: 'A',
        root: screenRoot('a-root', [
          text('a-text', 'screen-a'),
          button('to-b', 'to-b', { type: 'navigate', params: { screenId: 'b' } }),
          button('to-nowhere', 'to-nowhere', { type: 'navigate', params: { screenId: 'ghost' } }),
          button('back-a', 'back-a', { type: 'navigate.back' }),
          button('share', 'share', { type: 'share', params: { channel: 'chat' } }),
          button('inert', 'inert', { type: 'none' }),
        ]),
      },
      {
        screenId: 'b',
        name: 'B',
        root: screenRoot('b-root', [
          { id: 'b-bar', type: 'AppBar', props: { title: lit('bar-b'), showBack: true } },
          text('b-text', 'screen-b'),
          button('to-m', 'to-m', { type: 'navigate', params: { screenId: 'm' } }),
        ]),
      },
      { screenId: 'm', name: 'M', presentation: 'modal', root: screenRoot('m-root', [text('m-text', 'screen-m'), button('close', 'close', { type: 'navigate.back' })]) },
    ],
    { entryPoints: { deep: 'b' } },
  )
}

const click = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }))
}

/** A package without console reports: a test that needs reports passes its own handler. */
function silent(): (report: HotlayoutReport) => void {
  return () => undefined
}

describe('every contract fixture is drawn by the package', () => {
  it('the fixture list is not empty and contains the showcase with its theme', () => {
    expect(fixtureNames).toContain('rewards-showcase-screens')
    expect(Object.keys(themeOf('rewards-showcase-screens').themes)).toEqual(['light', 'dark'])
    expect(fixtureNames.length).toBeGreaterThanOrEqual(8)
  })

  it.each(fixtureNames)('%s: every screen as the starting one, every theme of the set — no rejections and no console errors', (name) => {
    const document = fixture(name)
    const theme = themeOf(name)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reports: HotlayoutReport[] = []
    try {
      for (const themeId of Object.keys(theme.themes)) {
        for (const entry of document.screens) {
          const view = render(
            <HotlayoutScreen
              document={{ ...document, initialScreenId: entry.screenId }}
              theme={theme}
              themeId={themeId}
              onReport={(report) => reports.push(report)}
            />,
          )
          const where = `${name}/${entry.screenId}/${themeId}`
          expect(screen.queryByRole('alert'), where).toBeNull()
          expect(view.container.querySelector(`[data-hl-node="${entry.root.id}"]`), where).not.toBeNull()
          view.unmount()
        }
      }
      expect(errors).not.toHaveBeenCalled()
      // Fixtures are documents and themes of THIS contract: no fallback ever happens on them.
      expect(reports).toEqual([])
    } finally {
      errors.mockRestore()
    }
  })

  it('showcase: three languages and data — texts come from the document translations', () => {
    const document = fixture('rewards-showcase-screens')
    const key = 'home/home-hello-label/content'
    for (const locale of ['uk', 'de']) {
      const view = render(<HotlayoutScreen document={document} theme={themeOf('rewards-showcase-screens')} locale={locale} data={{ 'user.firstName': 'Ada' }} />)
      expect(view.container.textContent).toContain(document.localization?.strings[locale]?.[key])
      expect(view.container.firstElementChild?.getAttribute('lang')).toBe(locale)
      view.unmount()
    }
  })
})

/*
 * Template text, numbers and plurals (schema 9.4.0). The character-for-character rule is covered by
 * the shared case table (the builder's `react-template-cases.test.tsx`), the policy rows by
 * the builder's `web-example.test.tsx`. Here: the package mirrors of the `x-template` block must not lag
 * behind the artifact, and the contract fixture must draw through the public entry in three
 * languages, with and without data.
 */
describe('template text: the x-template mirrors and the contract fixture', () => {
  const TEMPLATE = SCHEMA['x-template']
  const SAMPLE_NOW = Date.parse(DATA_ARTIFACT['x-sampleNow'])
  const samples: Record<string, unknown> = Object.fromEntries(DATA_ARTIFACT.contract.paths.map((entry) => [entry.path, entry.sampleValue]))

  it('limits and format parameters are exactly those of the artifact', () => {
    expect(TEMPLATE_VALUE_NAME_PATTERN.source).toBe(TEMPLATE.valueNamePattern)
    expect(MAX_TEMPLATE_VALUES).toBe(TEMPLATE.maxValues)
    expect([...PLURAL_CATEGORIES]).toEqual(TEMPLATE.pluralCategories)
    expect(NUMBER_FORMAT).toEqual(TEMPLATE.number)
    expect(CURRENCY_FORMAT).toEqual(TEMPLATE.currency)
    expect(DAYS_UNTIL).toEqual(TEMPLATE.daysUntil)
    expect(DATE_TIME_PATTERN).toBe(TEMPLATE.dateTimePattern)
    expect(DATE_CALENDAR).toBe(TEMPLATE.dateCalendar)
    expect(DATE_CALENDAR_CHECK).toEqual(TEMPLATE.dateCalendarCheck)
    expect(NUMBER_ROUNDING).toEqual(TEMPLATE.rounding)
    expect(NUMBER_FORMAT.maximumAbsoluteValue).toBe(Number.MAX_SAFE_INTEGER)
    expect([...COUNTABLE_FORMATS]).toEqual(TEMPLATE.countableFormats)
    expect(PLURAL_NUMBER).toEqual(TEMPLATE.pluralNumber)
    expect([...READER_BINDING_FORMATS]).toEqual(SCHEMA.$defs.BindingFormat?.enum)
    // The non-breaking space in the mirror is exactly the character the artifact names by code point.
    expect(CURRENCY_FORMAT.separator.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')).toBe(CURRENCY_FORMAT.separatorCodePoint.replace('U+', ''))
  })

  it('translation keys inside a place follow the artifact template', () => {
    const place = '<screenId>/<nodeId>/<field path>'
    expect(`${place}.${TEMPLATE_TEXT_SUBPATH}`).toBe(TEMPLATE.translationKeys.template)
    expect(`${place}.${pluralFormSubpath('<name>', '<category>' as 'other')}`).toBe(TEMPLATE.translationKeys.pluralForm)
    expect(TEMPLATE.placeholder).toBe('{name}')
  })

  it('the 9.4.0 policy words are the ones the package was written for; the features are named from 9.4.0', () => {
    expect(POLICY).toMatchObject({
      unknownStringKind: 'render-empty',
      undeclaredPlaceholder: 'render-literally-with-braces',
      unusedTemplateValue: 'allowed-not-shown',
      missingTemplateValue: 'value-fallback-keep-sentence',
      missingCurrencyCode: 'render-as-is',
      pluralCategory: 'cldr-cardinal-categories-not-exact-numbers',
      pluralNumber: 'absolute-value-rounded-to-three-fraction-digits',
      missingPluralForm: 'use-other',
      pluralLanguage: 'language-of-shown-forms',
      pluralWithoutNumber: 'use-other',
      pluralWithoutLanguage: 'use-other',
      daysUntil: 'ceil-of-remaining-24h-not-below-zero',
      readerClock: 'injectable-read-at-render',
      unknownTemplateValueKind: 'render-empty',
      emptyBoundString: 'use-fallback',
      dateValueForm: 'iso-8601-with-time-and-zone-else-as-is',
      pluralNumberWithoutData: 'numeric-fallback-else-other',
      numberBeyondSafeInteger: 'render-as-is',
      missingNumberLocaleData: 'render-as-is-days-as-plain-integer',
    })
    expect(SCHEMA['x-compatibility'].features).toMatchObject({ textTemplate: '9.4.0', numberFormats: '9.4.0' })
  })

  /** Node texts of the `template-text-screens` fixture on the dictionary samples at the sample moment (`x-sampleNow`). */
  const shownTexts = (locale: string, data: Record<string, unknown>, screenId = 'progress'): Record<string, string> => {
    const document = fixture('template-text-screens')
    const reports: HotlayoutReport[] = []
    const view = render(
      <HotlayoutScreen document={{ ...document, initialScreenId: screenId }} locale={locale} data={data} now={SAMPLE_NOW} timeZone="UTC" onReport={(report) => reports.push(report)} />,
    )
    const texts: Record<string, string> = {}
    for (const element of view.container.querySelectorAll('[data-hl-node]')) texts[element.getAttribute('data-hl-node') ?? ''] ??= element.textContent
    view.unmount()
    expect(reports).toEqual([])
    return texts
  }

  it('fixture in English: a number with separators, days counted from the sample moment, the word agrees', () => {
    const texts = shownTexts('en-US', samples)
    expect(texts.bar).toContain('Level 3 · 1,250 points')
    expect(texts.steps).toBe('3 / 5 steps')
    // The sample moment is 2026-10-10T09:00Z and `campaign.endsAt` is 2026-11-30T12:00Z: 51 days and three hours round up to 52.
    expect(texts.days).toBe('52 days left')
    expect(texts.discount).toBe('−20%')
    expect(texts['offer-row']).toContain('Ends in 22 days')
    const offer = shownTexts('en-US', samples, 'offer')
    expect(offer['offer-price']).toBe('Only 120\u00A0JOD until Oct 31, 2026')
    expect(offer['offer-days']).toBe('22 days left')
  })

  it('fixture in Ukrainian: the translation reorders the sentence, three word forms follow the Ukrainian rule', () => {
    const texts = shownTexts('uk-UA', samples)
    expect(texts.bar).toContain('Рівень 3 · 1\u00A0250 балів')
    expect(texts.steps).toBe('Кроків: 3 з 5')
    expect(texts.days).toBe('Лишилося 52 дні')
    expect(texts['offer-row']).toContain('Закінчиться через 22 дні')
    expect(shownTexts('uk', { ...samples, 'user.points': 21 }).bar).toContain('21 бал')
    expect(shownTexts('uk', { ...samples, 'user.points': 1.5 }).bar).toContain('1,5 бала')
  })

  it('fixture in Arabic: right to left, six Arabic categories, digits of the device locale', () => {
    const document = fixture('template-text-screens')
    const strings = document.localization?.strings.ar ?? {}
    const view = render(<HotlayoutScreen document={document} locale="ar-EG" data={samples} now={SAMPLE_NOW} onReport={silent()} />)
    expect(view.container.firstElementChild?.getAttribute('dir')).toBe('rtl')
    // 52 in Arabic is category `many`; the number is written with `ar-EG` digits.
    const expected = (strings['progress/days/content.template'] ?? '').replace('{days}', new Intl.NumberFormat('ar-EG').format(52)).replace('{unit}', strings['progress/days/content.values.unit.forms.many'] ?? '')
    expect(strings['progress/days/content.values.unit.forms.many']).toBeDefined()
    expect(view.container.querySelector('[data-hl-node="days"]')?.textContent).toBe(expected)
    expect(view.container.textContent).not.toMatch(/\{[a-z][A-Za-z0-9]*\}/)
  })

  it('without data: the fallback text of each value, the sentence stays whole, the word is `other`; no raw placeholder', () => {
    const texts = shownTexts('en', {})
    expect(texts.steps).toBe('— / — steps')
    expect(texts.days).toBe('— days left')
    expect(texts.bar).toContain('Level 1 · 0 points')
    // The fallback "0" looks like a number: in Ukrainian it selects the plural form for whole numbers, not the fraction form (`pluralNumberWithoutData`).
    expect(shownTexts('uk', {}).bar).toContain('Рівень 1 · 0 балів')
    expect(shownTexts('uk', {}).days).toBe('Лишилося — дня')
    for (const locale of ['en', 'uk', 'ar']) {
      for (const screenId of ['progress', 'offer']) {
        for (const shown of Object.values(shownTexts(locale, {}, screenId))) expect(shown).not.toMatch(/\{[a-z][A-Za-z0-9]*\}/)
      }
    }
  })
})

describe('the compatibility policy follows the x-compatibility of the artifact', () => {
  it('the policy words in the artifact are the ones the package was written for', () => {
    // If a word in the artifact changes, this test says the package must be revisited instead of silently diverging.
    expect(POLICY).toMatchObject({
      majorMustMatch: true,
      minorAdditionsAreOptional: true,
      unknownWidget: 'render-children',
      unknownWidgetStyle: 'ignore-style',
      unknownToken: 'fallback-to-field-default',
      tokenWithoutFieldDefault: 'omit-field',
      unknownAction: 'pass-to-host',
      unknownEntryPoint: 'use-initial',
      missingTranslation: 'fall-back-to-default-locale',
    })
    expect(THEME_POLICY).toMatchObject({ unreadableTheme: 'fallback-and-report', unknownThemeId: 'use-default', newerMinor: 'read-known-fields-only' })
  })

  it('reader versions equal the artifact versions (and those named in package.json)', () => {
    expect(READER_SCHEMA_VERSION).toBe(SCHEMA['x-schemaVersion'])
    expect(READER_THEME_VERSION).toBe(THEME_ARTIFACT['x-themeContractVersion'])
    expect(READER_ICON_SET_VERSION).toBe(ICONS_ARTIFACT.iconSetVersion)
    const manifest = json<{ hotlayout: { schemaVersion: string; themeContractVersion: string; iconSetVersion: string } }>(packageFile('package.json'))
    expect(manifest.hotlayout).toEqual({
      schemaVersion: SCHEMA['x-schemaVersion'],
      themeContractVersion: THEME_ARTIFACT['x-themeContractVersion'],
      iconSetVersion: ICONS_ARTIFACT.iconSetVersion,
    })
  })

  it('unknownWidget + unknownWidgetStyle: an unknown widget draws its children and its style is ignored entirely', () => {
    const future: UiNode = { id: 'future', type: 'Carousel3D', props: {}, style: { color: 'danger', padding: 'lg', background: { kind: 'color', color: 'primary' } }, children: [text('inside', 'inside')] }
    const view = render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root: screenRoot('root', [future]) }])} onReport={silent()} />)
    const inside = screen.getByText('inside')
    // The child sits directly in the screen: neither a box for the unknown node nor its colour in the context.
    expect(inside.parentElement?.hasAttribute('data-hl-content')).toBe(true)
    expect(inside.parentElement?.closest('[data-hl-node]')?.getAttribute('data-hl-node')).toBe('root')
    expect(view.container.querySelector('[data-hl-node="future"]')).toBeNull()
    expect(inside.style.color).toBe('var(--product-color-on-surface)')
  })

  it('tokenWithoutFieldDefault: an unknown token in style is not applied; unknownToken: in props the field default applies', () => {
    const root = screenRoot('root', [
      text('t', 'styled', { style: { padding: 'noSuchSpacing', background: { kind: 'color', color: 'noSuchColor' }, radius: 'md' } }),
      { id: 'col', type: 'Column', props: { gap: 'noSuchGap' }, children: [text('c1', 'c1')] },
    ])
    render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={silent()} />)
    const styled = screen.getByText('styled')
    expect(styled.style.padding).toBe('')
    expect(styled.style.backgroundColor).toBe('')
    // The known field next to it still applies: one property is lost, not the whole node look.
    expect(styled.style.borderRadius).toBe('var(--product-radius-md)')
    // The `Column.gap` default in the schema is `sm`.
    expect(screen.getByText('c1').parentElement?.style.gap).toBe('var(--product-space-sm)')
  })

  it('a newer minor is drawn and reported; a document with an unknown widget does not crash', () => {
    const [major] = READER_SCHEMA_VERSION.split('.')
    const newer = `${major ?? ''}.99.0`
    expect(checkDocumentVersion(newer)).toEqual({ kind: 'newer-minor', documentVersion: newer })
    const reports: HotlayoutReport[] = []
    render(<HotlayoutScreen document={{ ...fixture('minimal-screen'), schemaVersion: newer }} onReport={(report) => reports.push(report)} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(reports).toEqual([{ kind: 'newer-minor-document', documentVersion: newer }])
  })

  it('a different major (either way) and garbage instead of a version cause a loud rejection and nothing is drawn', () => {
    const major = Number(READER_SCHEMA_VERSION.split('.')[0])
    for (const version of [`${String(major + 1)}.0.0`, `${String(major - 1)}.20.0`, 'latest', '']) {
      expect(checkDocumentVersion(version).kind).toBe('incompatible')
      const reports: HotlayoutReport[] = []
      const view = render(<HotlayoutScreen document={{ ...fixture('minimal-screen'), schemaVersion: version }} onReport={(report) => reports.push(report)} />)
      expect(screen.getByRole('alert')).toBeDefined()
      expect(view.container.querySelector('[data-hl-node]')).toBeNull()
      expect(reports.map((report) => report.kind)).toEqual(['incompatible-document'])
      view.unmount()
    }
  })

  /* A newer major gives the user an action (update the app); an older one does not. */
  it('the rejection text depends on whose major is newer, and the reason and both versions go to the developer', () => {
    const major = Number(READER_SCHEMA_VERSION.split('.')[0])
    const cases = [
      { version: `${String(major + 1)}.0.0`, relation: 'document-newer', text: 'Update the app to see this screen.' },
      { version: `${String(major - 1)}.20.0`, relation: 'document-older', text: 'This screen is not available right now.' },
      { version: 'latest', relation: 'not-a-version', text: 'This screen is not available right now.' },
    ] as const
    for (const { version, relation, text } of cases) {
      const verdict = checkDocumentVersion(version)
      expect(verdict.kind === 'incompatible' && verdict.relation).toBe(relation)
      const reports: HotlayoutReport[] = []
      const view = render(<HotlayoutScreen document={{ ...fixture('minimal-screen'), schemaVersion: version }} onReport={(report) => reports.push(report)} />)
      expect(screen.getByRole('alert').textContent).toBe(text)
      expect(reports).toEqual([
        expect.objectContaining({ kind: 'incompatible-document', documentVersion: version, readerVersion: READER_SCHEMA_VERSION, relation }),
      ])
      view.unmount()
    }
  })

  it('without a handler the older-major reason tells the developer to republish the layout', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      render(<HotlayoutScreen document={{ ...fixture('minimal-screen'), schemaVersion: '8.20.0' }} />)
      const message = String(warn.mock.calls[0]?.[0])
      expect(message).toContain('8.20.0')
      expect(message).toContain(READER_SCHEMA_VERSION)
      expect(message).toContain('republish')
    } finally {
      warn.mockRestore()
    }
  })

  it('the rejection can be drawn in a custom way; without a handler the report goes to console.warn instead of vanishing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      render(<HotlayoutScreen document={{ ...fixture('minimal-screen'), schemaVersion: '1.0.0' }} renderIncompatible={(_verdict, version) => <p>custom {version}</p>} />)
      expect(screen.getByText('custom 1.0.0')).toBeDefined()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByText(/not available|Update the app/)).toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('[hotlayout]')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('theme: the screen is always drawn', () => {
  it('without a theme the built-in one is used, and it is not a fallback: no reports', () => {
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={fixture('minimal-screen')} onReport={(report) => reports.push(report)} />)
    const root = view.container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--product-color-primary')).toBe(THEME_ARTIFACT.contract.themes.light?.color.primary)
    expect(reports).toEqual([])
  })

  it('the package built-in theme is the `contract` block of the theme artifact, byte for byte', () => {
    expect(BUILT_IN_THEME_CONTRACT).toEqual(THEME_ARTIFACT.contract)
  })

  it('unreadableTheme: a foreign major, a non-object, no themes — the built-in theme and a report', () => {
    const major = Number(READER_THEME_VERSION.split('.')[0])
    const broken: unknown[] = [{ ...THEME_ARTIFACT.contract, themeContractVersion: `${String(major + 1)}.0.0` }, 'not a theme', { themeContractVersion: READER_THEME_VERSION }, { themeContractVersion: READER_THEME_VERSION, defaultThemeId: 'x', themes: {} }]
    for (const contract of broken) {
      const resolved = resolveTheme(contract)
      expect(resolved.theme).toEqual(THEME_ARTIFACT.contract.themes.light)
      expect(resolved.reports.map((report) => report.kind)).toEqual(['theme-fallback'])
    }
    // The fallback theme has the requested brightness, if the built-in set has one.
    expect(resolveTheme('garbage', 'dark').theme.brightness).toBe('dark')
  })

  it('unknownThemeId: an unknown id gives the default theme of the set, and it is reported', () => {
    const resolved = resolveTheme(themeOf('rewards-showcase-screens'), 'sepia')
    expect(resolved.theme.id).toBe('light')
    expect(resolved.reports).toEqual([{ kind: 'unknown-theme-id', themeId: 'sepia', used: 'light' }])
    // `__proto__` is not a theme of the set: the set has no own key with that name.
    expect(resolveTheme(themeOf('rewards-showcase-screens'), '__proto__').theme.id).toBe('light')
  })

  it('partialTheme: a theme without dictionaries does not crash the render; the core is completed with built-in values of the same brightness', () => {
    const partial = { themeContractVersion: READER_THEME_VERSION, defaultThemeId: 'p', themes: { p: { name: 'P', brightness: 'dark', color: { primary: '#ff0000' } } } }
    const resolved = resolveTheme(partial)
    expect(resolved.reports).toEqual([])
    expect(resolved.theme.color.primary).toBe('#ff0000')
    expect(resolved.theme.color.surface).toBe(THEME_ARTIFACT.contract.themes.dark?.color.surface)
    expect(resolved.theme.spacing.md).toBe(THEME_ARTIFACT.contract.themes.dark?.spacing.md)
    const view = render(<HotlayoutScreen document={fixture('full-catalog-screen')} theme={partial as unknown as ThemeContract} onReport={silent()} />)
    expect(view.container.querySelector('[data-hl-node]')).not.toBeNull()
  })

  it('theme newerMinor: read by keys, unknown fields do no harm', () => {
    const [major] = READER_THEME_VERSION.split('.')
    const newer = { ...THEME_ARTIFACT.contract, themeContractVersion: `${major ?? ''}.99.0`, futureSection: { anything: true } }
    expect(resolveTheme(newer).reports).toEqual([])
  })
})

describe('actions and navigation', () => {
  function mount(extra: Partial<Parameters<typeof HotlayoutScreen>[0]> = {}) {
    const actions: [HotlayoutAction, { nodeId: string; screenId: string }][] = []
    const shown: ScreenInfo[] = []
    const view = render(
      <HotlayoutScreen
        document={flowDocument()}
        onAction={(action, source) => actions.push([action, source])}
        onScreenChange={(info) => shown.push(info)}
        onReport={silent()}
        {...extra}
      />,
    )
    return { actions, shown, view }
  }

  it('the package performs navigate between document screens itself; the host hears about it via onScreenChange, not onAction', () => {
    const { actions, shown } = mount()
    expect(screen.getByText('screen-a')).toBeDefined()
    click('to-b')
    expect(screen.queryByText('screen-a')).toBeNull()
    expect(screen.getByText('screen-b')).toBeDefined()
    expect(actions).toEqual([])
    // The three fields that predate 9.8 are unchanged; the rest are screen-shown event fields (the builder's `react-actions-cases.test.tsx` checks them against the case table).
    expect(shown).toMatchObject([
      { screenId: 'a', name: 'A', presentation: 'page', cause: 'entry', depth: 1 },
      { screenId: 'b', name: 'B', presentation: 'page', cause: 'forward', depth: 2 },
    ])
  })

  it('navigate.back goes one step back; the AppBar arrow is the same action', () => {
    mount()
    click('to-b')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('screen-a')).toBeDefined()
    expect(screen.queryByText('screen-b')).toBeNull()
  })

  it('a modal screen lies ON TOP: the previous one stays drawn; a tap on the scrim goes back', () => {
    const { view, shown } = mount({ entry: 'deep' })
    click('to-m')
    expect(screen.getByText('screen-b')).toBeDefined()
    expect(screen.getByRole('dialog', { name: 'M' })).toBeDefined()
    expect(shown.at(-1)).toMatchObject({ screenId: 'm', name: 'M', presentation: 'modal', cause: 'forward', depth: 2 })
    const layers = [...view.container.querySelectorAll('[data-hl-screen]')].map((layer) => [layer.getAttribute('data-hl-screen'), layer.getAttribute('data-hl-presentation')])
    expect(layers).toEqual([
      ['b', 'page'],
      ['m', 'modal'],
    ])

    fireEvent.click(view.container.querySelector('[data-hl-scrim]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('screen-b')).toBeDefined()
  })

  it('unknownAction: whatever the package does not perform goes to the host as is, with the node and the screen', () => {
    const { actions } = mount()
    click('share')
    click('to-nowhere')
    click('back-a')
    expect(actions).toEqual([
      [{ type: 'share', params: { channel: 'chat' } }, { nodeId: 'share', screenId: 'a' }],
      // The screen is not in the document: the host may know more (another document), so the action is not dropped.
      [{ type: 'navigate', params: { screenId: 'ghost' } }, { nodeId: 'to-nowhere', screenId: 'a' }],
      // Back from the first screen leaves the flow, which is the host's decision.
      [{ type: 'navigate.back' }, { nodeId: 'back-a', screenId: 'a' }],
    ])
    expect(screen.getByText('screen-a')).toBeDefined()
  })

  it('the `none` action does not reach the host: it means do nothing, not an event', () => {
    const { actions } = mount()
    click('inert')
    expect(actions).toEqual([])
  })

  it('the host can intercept a navigation: onNavigate returns false and the package changes nothing', () => {
    const events: NavigationEvent[] = []
    mount({
      onNavigate: (event) => {
        events.push(event)
        return false
      },
    })
    click('to-b')
    expect(screen.getByText('screen-a')).toBeDefined()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'push', from: { screenId: 'a' }, to: { screenId: 'b' }, action: { type: 'navigate' }, source: { nodeId: 'to-b' } })
  })

  it('a named entry point opens its own screen; unknownEntryPoint gives the starting screen and is reported', () => {
    const reports: HotlayoutReport[] = []
    const first = render(<HotlayoutScreen document={flowDocument()} entry="deep" onReport={(report) => reports.push(report)} />)
    expect(screen.getByText('screen-b')).toBeDefined()
    expect(reports).toEqual([])
    first.unmount()

    render(<HotlayoutScreen document={flowDocument()} entry="gone-last-week" onReport={(report) => reports.push(report)} />)
    expect(screen.getByText('screen-a')).toBeDefined()
    expect(reports).toEqual([{ kind: 'unknown-entry', entry: 'gone-last-week' }])
    // A name from the map prototype is not an entry point.
    cleanup()
    render(<HotlayoutScreen document={flowDocument()} entry="constructor" onReport={silent()} />)
    expect(screen.getByText('screen-a')).toBeDefined()
  })

  it('the same document as a NEW object does not reset the stack; a different entry does', () => {
    const { view } = mount()
    click('to-b')
    // The host re-read the published file: a new object, the same document.
    view.rerender(<HotlayoutScreen document={flowDocument()} onReport={silent()} />)
    expect(screen.getByText('screen-b')).toBeDefined()

    view.rerender(<HotlayoutScreen document={flowDocument()} entry="deep" onReport={silent()} />)
    click('to-m')
    view.rerender(<HotlayoutScreen document={flowDocument()} onReport={silent()} />)
    expect(screen.getByText('screen-a')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a modal screen shown FIRST is drawn as a page', () => {
    const document = flowDocument()
    const { view, shown } = mount({ document: { ...document, initialScreenId: 'm' } })
    expect(view.container.querySelector('[data-hl-presentation="modal"]')).toBeNull()
    expect(shown).toMatchObject([{ screenId: 'm', name: 'M', presentation: 'page', cause: 'entry', depth: 1 }])
  })

  it('a choice group keeps the selection and writes the bound value to the host; a row with an action is a button', () => {
    const option = (id: string, value: string): UiNode => ({ id, type: 'ListTile', props: { title: lit(id), leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: value } } })
    const root = screenRoot('root', [
      { id: 'group', type: 'ChoiceGroup', props: { value: { kind: 'binding', path: 'item.selectedId', fallback: '' }, gap: 'none' }, children: [option('one', '1'), option('two', '2')] },
      { id: 'row', type: 'ListTile', props: { title: lit('row'), leading: { kind: 'none' }, trailing: { kind: 'chevron' }, action: { type: 'open', params: { id: '7' } } } },
      { id: 'plain', type: 'ListTile', props: { title: lit('plain'), leading: { kind: 'none' }, trailing: { kind: 'none' } } },
    ])
    const writes: [string, string | boolean | number][] = []
    const actions: HotlayoutAction[] = []
    render(
      <HotlayoutScreen
        document={documentOf([{ screenId: 's', name: 'S', root }])}
        data={{ 'item.selectedId': '1' }}
        onWrite={(path, value) => writes.push([path, value])}
        onAction={(action) => actions.push(action)}
        onReport={silent()}
      />,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    fireEvent.click(radios[1]!)
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    expect(writes).toEqual([['item.selectedId', '2']])

    fireEvent.keyDown(screen.getByRole('button', { name: /row/ }), { key: 'Enter' })
    expect(actions).toEqual([{ type: 'open', params: { id: '7' } }])
    // A row without an action and without a choice does not pretend to be a button.
    expect(screen.getByText('plain').closest('[data-hl-node="plain"]')?.getAttribute('role')).toBeNull()
  })

  it('the user switches tabs; the document only says which one is open first', () => {
    const tab = (id: string): UiNode => ({ id, type: 'Tab', props: { title: lit(`title-${id}`) }, children: [text(`${id}-body`, `body-${id}`)] })
    const root = screenRoot('root', [{ id: 'tabs', type: 'Tabs', props: { initialTab: 1 }, children: [tab('t1'), tab('t2')] }])
    render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={silent()} />)
    expect(screen.getByText('body-t2')).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'title-t1' }))
    expect(screen.getByText('body-t1')).toBeDefined()
    expect(screen.queryByText('body-t2')).toBeNull()
    expect(screen.getByRole('tab', { name: 'title-t1' }).getAttribute('aria-selected')).toBe('true')
  })
})

/*
 * Schema 9.1.0. The host passes the DEVICE locale (`ar-EG`, `uk_UA`) while the document has
 * translations under short codes. The shared case table is checked by
 * the builder's `locale-cases.test.ts`; here the answer must actually reach the screen: texts,
 * direction, `lang` and date format come from one answer per document.
 */
describe('device locale: translation lookup by truncating parts', () => {
  const END = '2026-10-31T21:59:59.000Z'
  const arabic = (locales: readonly string[], strings: Record<string, Record<string, string>>): UiDocument => ({
    ...documentOf([
      {
        screenId: 's',
        name: 'S',
        root: screenRoot('root', [
          text('title', 'Choose a reward'),
          text('note', 'Valid on weekends'),
          { id: 'ends', type: 'Text', props: { content: { kind: 'binding', path: 'offer.endsAt', fallback: '—', format: 'date' } } },
        ]),
      },
    ]),
    localization: { defaultLocale: 'en', locales: ['en', ...locales], strings },
  })
  const rootOf = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement
  const dateIn = (locale: string): string => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(END))

  it('the policy words in the artifact are the ones the lookup was written for', () => {
    expect(POLICY).toMatchObject({
      localeNormalization: 'underscore-as-hyphen-case-insensitive',
      localeMatching: 'bcp47-lookup-truncate',
      localeChildFallback: 'none',
      unmatchedLocale: 'use-default-locale',
      localeResolution: 'once-per-document',
      directionFollows: 'shown-translation-locale',
      formattingLocale: 'requested-when-matched-else-default',
    })
  })

  it('ar-EG, ar_EG and AR-eg find the ar translation: Arabic text, right to left, Egyptian date format', () => {
    const document = arabic(['ar'], { ar: { 's/title/content': 'اختر مكافأة' } })
    for (const locale of ['ar-EG', 'ar_EG', 'AR-eg']) {
      const view = render(<HotlayoutScreen document={document} locale={locale} timeZone="UTC" data={{ 'offer.endsAt': END }} onReport={silent()} />)
      const root = rootOf(view.container)
      expect(root.textContent, locale).toContain('اختر مكافأة')
      expect(root.getAttribute('dir'), locale).toBe('rtl')
      // `lang` is the language of the SHOWN text, that is the document key, not the device locale.
      expect(root.getAttribute('lang'), locale).toBe('ar')
      // The format uses the requested locale: Egypt, not generic Arabic.
      expect(root.textContent, locale).toContain(dateIn('ar-EG'))
      view.unmount()
    }
  })

  it('one answer per document: a string with no translation in the active language shows the source text, not a third language', () => {
    const document = arabic(['ar', 'ar-EG'], { ar: { 's/note/content': 'صالح في عطلة نهاية الأسبوع' }, 'ar-EG': { 's/title/content': 'اختار مكافأة' } })
    const view = render(<HotlayoutScreen document={document} locale="ar-EG" onReport={silent()} />)
    // Exact `ar-EG` match: the title comes from it and the note is the SOURCE text, although `ar` translates it.
    expect(view.container.textContent).toContain('اختار مكافأة')
    expect(view.container.textContent).toContain('Valid on weekends')
    expect(view.container.textContent).not.toContain('صالح')
  })

  it('no guessing the other way: `ar` with only `ar-EG` available gives the source language, left to right, with its date format', () => {
    const document = arabic(['ar-EG'], { 'ar-EG': { 's/title/content': 'اختار مكافأة' } })
    const view = render(<HotlayoutScreen document={document} locale="ar" timeZone="UTC" data={{ 'offer.endsAt': END }} onReport={silent()} />)
    const root = rootOf(view.container)
    expect(root.textContent).toContain('Choose a reward')
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(root.getAttribute('lang')).toBe('en')
    // No Arabic digits next to English text.
    expect(root.textContent).toContain(dateIn('en'))
    expect(root.textContent).not.toContain(dateIn('ar'))
  })

  it('showcase: uk-UA and de_DE show Ukrainian and German, fr-FR shows the source English', () => {
    const document = fixture('rewards-showcase-screens')
    const key = 'home/home-hello-label/content'
    for (const [locale, translation] of [['uk-UA', 'uk'], ['de_DE', 'de']] as const) {
      const view = render(<HotlayoutScreen document={document} theme={themeOf('rewards-showcase-screens')} locale={locale} data={{ 'user.firstName': 'Ada' }} />)
      expect(view.container.textContent, locale).toContain(document.localization?.strings[translation]?.[key])
      expect(rootOf(view.container).getAttribute('lang'), locale).toBe(translation)
      view.unmount()
    }
    const view = render(<HotlayoutScreen document={document} theme={themeOf('rewards-showcase-screens')} locale="fr-FR" data={{ 'user.firstName': 'Ada' }} />)
    expect(rootOf(view.container).getAttribute('lang')).toBe('en')
    expect(view.container.textContent).not.toContain(document.localization?.strings.uk?.[key])
  })

  it('an unusable locale means no language was requested: the source language, without an exception', () => {
    const document = arabic(['ar'], { ar: { 's/title/content': 'اختر مكافأة' } })
    for (const locale of ['', 'ar--EG', '!!', 'x-ar', 'constructor', '__proto__']) {
      const view = render(<HotlayoutScreen document={document} locale={locale} onReport={silent()} />)
      expect(view.container.textContent, locale).toContain('Choose a reward')
      expect(rootOf(view.container).getAttribute('dir'), locale).toBe('ltr')
      view.unmount()
    }
  })
})

describe('right-to-left writing', () => {
  const icon = (id: string, name: string): UiNode => ({ id, type: 'Icon', props: { name, size: 'md' } })
  const rtlDocument = (): UiDocument =>
    documentOf([
      {
        screenId: 's',
        name: 'S',
        root: screenRoot('root', [
          { id: 'bar', type: 'AppBar', props: { title: lit('عنوان'), showBack: true } },
          icon('chev', 'chevron'),
          icon('star', 'star'),
          { id: 'tile', type: 'ListTile', props: { title: lit('صف'), leading: { kind: 'none' }, trailing: { kind: 'chevron' } } },
        ]),
      },
    ])
  const glyphOf = (container: HTMLElement, nodeId: string, name: string): HTMLElement => {
    const glyph = container.querySelector<HTMLElement>(`[data-hl-node="${nodeId}"] [data-hl-glyph="${name}"], [data-hl-node="${nodeId}"] > [data-hl-glyph="${name}"]`)
    if (glyph === null) throw new Error(`glyph ${name} is missing in ${nodeId}`)
    return glyph
  }

  it('Arabic (Egypt): dir is on the SCREEN root, not on the page; there are no separate dir attributes inside', () => {
    const view = render(<HotlayoutScreen document={rtlDocument()} locale="ar-EG" onReport={silent()} />)
    const root = view.container.firstElementChild as HTMLElement
    expect(root.getAttribute('dir')).toBe('rtl')
    expect(root.getAttribute('lang')).toBe('ar-EG')
    expect(root.querySelectorAll('[dir]')).toHaveLength(0)
    expect(globalThis.document.documentElement.getAttribute('dir')).toBeNull()
  })

  it('exactly the icons of x-mirroredIcons are mirrored, by reflection and not by rotation', () => {
    expect(MIRRORED_ICONS).toEqual(SCHEMA['x-mirroredIcons'])
    const rtl = render(<HotlayoutScreen document={rtlDocument()} locale="ar" onReport={silent()} />)
    expect(glyphOf(rtl.container, 'chev', 'chevron').style.scale).toBe('-1 1')
    expect(glyphOf(rtl.container, 'tile', 'chevron').style.scale).toBe('-1 1')
    expect(glyphOf(rtl.container, 'star', 'star').style.scale).toBe('')
    // The back arrow: the same chevron turned half a revolution points right in RTL.
    const back = glyphOf(rtl.container, 'bar', 'chevron')
    expect(back.style.scale).toBe('-1 1')
    expect(back.parentElement?.style.rotate).toBe('180deg')
    rtl.unmount()

    const ltr = render(<HotlayoutScreen document={rtlDocument()} locale="en" onReport={silent()} />)
    expect((ltr.container.firstElementChild as HTMLElement).getAttribute('dir')).toBe('ltr')
    expect(glyphOf(ltr.container, 'chev', 'chevron').style.scale).toBe('')
  })

  it('direction follows the language the document is SHOWN in: a language missing from the document gives the document language texts and direction', () => {
    const localized = { ...rtlDocument(), localization: { defaultLocale: 'en', locales: ['en', 'uk'], strings: { uk: {} } } }
    const view = render(<HotlayoutScreen document={localized} locale="ar" onReport={silent()} />)
    expect((view.container.firstElementChild as HTMLElement).getAttribute('dir')).toBe('ltr')
    view.unmount()
    // The host can state the direction itself.
    const forced = render(<HotlayoutScreen document={localized} locale="en" dir="rtl" onReport={silent()} />)
    expect((forced.container.firstElementChild as HTMLElement).getAttribute('dir')).toBe('rtl')
    expect(glyphOf(forced.container, 'chev', 'chevron').style.scale).toBe('-1 1')
  })

  it('the layout is logical: no left / right in screen styles', () => {
    const view = render(<HotlayoutScreen document={fixture('rewards-showcase-screens')} theme={themeOf('rewards-showcase-screens')} locale="ar" onReport={silent()} />)
    const physical = [...view.container.querySelectorAll<HTMLElement>('[style]')]
      .map((element) => element.getAttribute('style') ?? '')
      .filter((style) => /(?:^|[;\s])(?:margin|padding|border|inset)?-?(?:left|right)\s*:|text-align:\s*(?:left|right)/.test(style))
    expect(physical).toEqual([])
  })
})

describe('icons and the press area', () => {
  it('the package icon set equals the artifact, one glyph for each schema token', () => {
    const schemaIcons = SCHEMA.$defs.IconToken?.enum ?? []
    // The set copy equals the artifact: grid and bodies by content, set version, list of schema names.
    expect({ ...ICON_GRID }).toEqual(ICONS_ARTIFACT.grid)
    expect(ICON_BODIES).toEqual(ICONS_ARTIFACT.icons)
    expect(ICON_SET_VERSION).toBe(ICONS_ARTIFACT.iconSetVersion)
    expect(Object.keys(ICON_BODIES).sort()).toEqual([...schemaIcons].sort())
    expect(schemaIcons).toHaveLength(332)
    expect(Object.keys(ASSET_PLACEHOLDERS).sort()).toEqual([...(SCHEMA.$defs.AssetToken?.enum ?? [])].sort())
  })

  it('the icon box is one font size wide and one token LINE high, on a block element', () => {
    const root = screenRoot('root', [{ id: 'i', type: 'Icon', props: { name: 'gift', size: 'lg', alt: 'gift' } }])
    render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={silent()} />)
    const box = screen.getByRole('img', { name: 'gift' })
    // Block flex: an inline box would sit on the parent baseline and get a gap below it.
    expect(box.style.display).toBe('flex')
    expect(box.style.font).toBe('var(--product-font-display-l)')
    const glyph = box.firstElementChild as HTMLElement
    expect(glyph.style.inlineSize).toBe('1em')
    expect(glyph.style.blockSize).toBe('1lh')
    expect(glyph.style.maskImage || glyph.style.getPropertyValue('-webkit-mask-image')).toContain('data:image/svg+xml')
  })

  it('an icon unknown to the reader leaves an empty box of the same size instead of an invented glyph', () => {
    const root = screenRoot('root', [{ id: 'i', type: 'Icon', props: { name: 'icon-from-the-future', size: 'md' } }])
    const view = render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={silent()} />)
    const glyph = view.container.querySelector<HTMLElement>('[data-hl-glyph="icon-from-the-future"]')!
    expect(glyph.style.inlineSize).toBe('1em')
    expect(glyph.style.backgroundColor).toBe('')
  })

  it('EVERY name of the set is drawn: a data-URI mask filled with the foreground colour', () => {
    const names = Object.keys(ICON_BODIES)
    const root = screenRoot(
      'root',
      names.map((name): UiNode => ({ id: `i-${name}`, type: 'Icon', props: { name, size: 'md' } })),
    )
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={(report) => reports.push(report)} />)
    for (const name of names) {
      const glyph = view.container.querySelector<HTMLElement>(`[data-hl-glyph="${name}"]`)
      if (glyph === null) throw new Error(`glyph ${name} is missing`)
      expect(glyph.style.backgroundColor, name).toBe('currentcolor')
      expect(glyph.style.maskImage || glyph.style.getPropertyValue('-webkit-mask-image'), name).toContain('data:image/svg+xml')
    }
    expect(reports).toEqual([])
  })

  it('fill and stroke width of individual elements reach the mask; the body colour is black, not currentColor', () => {
    const decoded = (name: string): string => decodeURIComponent(iconMask(name) ?? '')
    // `lock`: a filled rectangle without a stroke plus an outlined shackle.
    expect(decoded('lock')).toContain("<rect fill='black' stroke='none'")
    expect(decoded('lock')).toContain("<path d='M8 10V7")
    // `check` is thicker than `x`: the element's own `stroke-width` overrides the grid.
    expect(decoded('check')).toContain("stroke-width='2.5'")
    expect(decoded('x')).not.toContain("stroke-width='2.5'")
    expect(decoded('x')).toContain("stroke-width='2'")
    for (const name of Object.keys(ICON_BODIES)) {
      expect(decoded(name), name).not.toContain('currentColor')
      expect(decoded(name), name).toMatch(/^url\("data:image\/svg\+xml,<svg [^"]*<\/svg>"\)$/)
    }
  })

  it('the icon colour is the node foreground: style.color repaints both fill and stroke', () => {
    const root = screenRoot('root', [{ id: 'i', type: 'Icon', props: { name: 'lock', size: 'md', alt: 'lock' }, style: { color: 'danger' } }])
    render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={silent()} />)
    const box = screen.getByRole('img', { name: 'lock' })
    expect(box.style.color).toBe('var(--product-color-danger)')
    expect((box.firstElementChild as HTMLElement).style.backgroundColor).toBe('currentcolor')
  })

  it('names from the prototype and non-strings are not names of the set', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'no-such-icon', '', 7, null, undefined, {}, ['star']]) {
      expect(iconMask(name), typeof name).toBeUndefined()
    }
  })

  it('RTL mirroring: each listed name is mirrored EXACTLY once, the rest are not', () => {
    const names = Object.keys(ICON_BODIES)
    const root = screenRoot(
      'root',
      names.map((name): UiNode => ({ id: `i-${name}`, type: 'Icon', props: { name, size: 'md' } })),
    )
    const doc = documentOf([{ screenId: 's', name: 'S', root }])
    const rtl = render(<HotlayoutScreen document={doc} locale="ar" onReport={silent()} />)
    for (const name of names) {
      const glyph = rtl.container.querySelector<HTMLElement>(`[data-hl-glyph="${name}"]`)
      expect(glyph?.style.scale, name).toBe(SCHEMA['x-mirroredIcons'].includes(name) ? '-1 1' : '')
      // Once: neither the frame nor the ancestors carry a second reflection or rotation.
      expect(glyph?.parentElement?.style.scale, name).toBe('')
      expect(glyph?.parentElement?.style.rotate, name).toBe('')
    }
    expect(SCHEMA['x-mirroredIcons']).toHaveLength(29)
    rtl.unmount()
    const ltr = render(<HotlayoutScreen document={doc} locale="en" onReport={silent()} />)
    for (const name of names) expect(ltr.container.querySelector<HTMLElement>(`[data-hl-glyph="${name}"]`)?.style.scale, name).toBe('')
  })

  it('the Lucide licence notices ship with the package', () => {
    const manifest = json<{ files: string[] }>(packageFile('package.json'))
    expect(manifest.files).toContain('THIRD-PARTY-NOTICES.md')
  })

  it('everything pressable has the touch-area class, which does not change the button size', () => {
    render(<HotlayoutScreen document={flowDocument()} entry="deep" onReport={silent()} />)
    const pressable = [screen.getByRole('button', { name: 'to-m' }), screen.getByRole('button', { name: 'Back' })]
    for (const element of pressable) {
      expect(element.classList.contains(PRESSABLE_CLASS)).toBe(true)
      expect(element.style.minBlockSize).toBe('')
      expect(element.style.minInlineSize).toBe('')
      expect(element.style.minHeight).toBe('')
    }
    // The area is an out-of-flow pseudo-element, at least 48 x 48 around the centre.
    expect(MIN_TOUCH_TARGET).toBe(48)
    const rule = HOTLAYOUT_CSS.split('\n').find((line) => line.includes(`.${PRESSABLE_CLASS}::after`)) ?? ''
    expect(rule).toContain('position:absolute')
    expect(rule).toContain('inline-size:max(100%,48px)')
    expect(rule).toContain('block-size:max(100%,48px)')
  })

  it('a button with a given box clips the LABEL, not the press area', () => {
    const root = screenRoot('root', [{ ...button('b', 'label', { type: 'none' }), style: { width: 60, height: 20, radius: 'pill' } }])
    render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root }])} onReport={silent()} />)
    const element = screen.getByRole('button', { name: 'label' })
    expect(element.style.overflow).toBe('')
    expect(element.style.width).toBe('60px')
    expect((element.firstElementChild as HTMLElement).style.overflow).toBe('hidden')
  })
})

describe('style isolation and the public entry', () => {
  it('the stylesheet ships with the screen and applies only inside the root; it can be omitted', () => {
    const view = render(<HotlayoutScreen document={fixture('minimal-screen')} onReport={silent()} />)
    const root = view.container.firstElementChild as HTMLElement
    expect(root.hasAttribute('data-hotlayout')).toBe(true)
    expect(root.querySelector('style')?.textContent).toBe(HOTLAYOUT_CSS)
    // Every selector starts with the root boundary: nothing leaks outward.
    for (const line of HOTLAYOUT_CSS.split('\n')) expect(line.startsWith('[data-hotlayout]:not(#hl-none) ')).toBe(true)
    // ...and only inside the package's OWN root: `:is()` would match every argument, including a host element.
    expect(HOTLAYOUT_CSS).not.toMatch(/:is\(|:where\(/)
    expect(globalThis.document.head.querySelector('style')).toBeNull()
    view.unmount()

    const bare = render(<HotlayoutScreen document={fixture('minimal-screen')} injectStyles={false} onReport={silent()} />)
    expect(bare.container.querySelector('style')).toBeNull()
  })

  it('inherited text properties are named on the root, so the host page does not leak inside', () => {
    const view = render(<HotlayoutScreen document={fixture('minimal-screen')} className="host-class" style={{ minBlockSize: 600 }} onReport={silent()} />)
    const root = view.container.firstElementChild as HTMLElement
    expect(root.className).toBe('host-class')
    expect(root.style.minBlockSize).toBe('600px')
    expect(root.style.font).toBe('var(--product-font-body-m)')
    expect(root.style.color).toBe('var(--product-color-on-surface)')
    for (const property of ['textAlign', 'textTransform', 'whiteSpace', 'wordSpacing', 'letterSpacing'] as const) expect(root.style[property]).not.toBe('')
  })

  it('the public entry is small and stable: exactly these names', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      ['ACTION_CATALOG', 'BUILT_IN_THEME_CONTRACT', 'HOTLAYOUT_CSS', 'HotlayoutLoadError', 'HotlayoutScreen', 'READER_ICON_SET_VERSION', 'READER_SCHEMA_VERSION', 'READER_THEME_VERSION', 'checkDocumentVersion', 'loadDocument', 'loadTheme', 'openInNewTab', 'paramFormProblem', 'resolveLocale', 'resolveTheme', 'runStandardAction'].sort(),
    )
  })

  it('the package is self-contained: no import from outside its own folder except react', () => {
    const sources = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
    expect(sources.length).toBeGreaterThan(10)
    for (const file of sources) {
      const imports = [...readFileSync(join(SRC_DIR, file), 'utf8').matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '')
      for (const source of imports) expect(source === 'react' || (source.startsWith('.') && !relative(SRC_DIR, join(SRC_DIR, dirname(file), source)).startsWith('..')), `${file} imports ${source}`).toBe(true)
    }
    // And no access to browser globals at module level or during render.
    // The one exception is the standard-actions helper: the ONLY place where a document address is opened on behalf of the host (`openInNewTab`).
    for (const file of sources.filter((name) => name !== 'standard-actions.ts')) {
      // Comments, quoted strings, object keys and property access (`rules.window.margin`) are not globals: here the word `window` names a layer SHAPE (9.18.0), not the browser window.
      const code = readFileSync(join(SRC_DIR, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
        .replace(/'[^'\n]*'|"[^"\n]*"/g, "''")
        .replace(/([{,]\s*|^\s*)(?:window|localStorage|navigator)\s*:/gm, '$1key:')
      expect(/(?<![\w.-])(?:window|localStorage|navigator)(?![\w-])|\bdocument\.(?:body|head|querySelector|createElement|documentElement)\b/.test(code), file).toBe(false)
    }
  })

  it('manifest: publishable, Apache-2.0, React is a peer dependency, no side effects', () => {
    const manifest = json<Record<string, unknown>>(packageFile('package.json'))
    expect(manifest.name).toBe('@hotlayout/react')
    expect(manifest.private).toBeUndefined()
    expect(manifest.license).toBe('Apache-2.0')
    expect(manifest.sideEffects).toBe(false)
    expect(Object.keys(manifest.peerDependencies as object).sort()).toEqual(['react', 'react-dom'])
    expect(manifest.dependencies).toBeUndefined()
    expect(readFileSync(packageFile('LICENSE'), 'utf8')).toContain('Apache License')
  })
})

describe('loaders, separate from the renderer', () => {
  const answer = (body: unknown, status = 200): Response => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

  it('a request WITHOUT custom headers: any header would cost a preflight', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const fetch = ((url: string, init?: RequestInit) => {
      calls.push([url, init])
      return Promise.resolve(answer({ schemaVersion: READER_SCHEMA_VERSION }))
    }) as typeof globalThis.fetch
    const document = await loadDocument('https://cdn.example/published.json', { fetch })
    expect(document.schemaVersion).toBe(READER_SCHEMA_VERSION)
    expect(calls).toEqual([['https://cdn.example/published.json', {}]])
  })

  it('cache bypass goes through the ADDRESS, not a header', async () => {
    const urls: string[] = []
    const fetch = ((url: string) => {
      urls.push(url)
      return Promise.resolve(answer(THEME_ARTIFACT.contract))
    }) as typeof globalThis.fetch
    await loadTheme('https://cdn.example/theme.json?alt=media#frag', { fetch, bypassCache: true })
    await loadTheme('https://cdn.example/theme.json', { fetch, bypassCache: true })
    expect(urls[0]).toMatch(/^https:\/\/cdn\.example\/theme\.json\?alt=media&_req=[a-z0-9]+#frag$/)
    expect(urls[1]).toMatch(/^https:\/\/cdn\.example\/theme\.json\?_req=[a-z0-9]+$/)
  })

  it('a server rejection, non-JSON and a non-object give an error with address and status; an aborted request gives a CORS hint', async () => {
    const failing = (response: () => Promise<Response>) => ({ fetch: (() => response()) as typeof globalThis.fetch })
    await expect(loadDocument('u', failing(() => Promise.resolve(answer('nope', 404))))).rejects.toMatchObject({ name: 'HotlayoutLoadError', status: 404, url: 'u' })
    await expect(loadDocument('u', failing(() => Promise.resolve(answer('<html>'))))).rejects.toBeInstanceOf(HotlayoutLoadError)
    await expect(loadDocument('u', failing(() => Promise.resolve(answer([1, 2]))))).rejects.toBeInstanceOf(HotlayoutLoadError)
    await expect(loadDocument('u', failing(() => Promise.reject(new TypeError('Failed to fetch'))))).rejects.toThrow(/CORS/)
  })
})

describe('state does not leak between renders', () => {
  it('an accordion and tabs keep the user state while the screen stays in place', () => {
    const root = screenRoot('root', [{ id: 'acc', type: 'Accordion', props: { title: lit('acc'), initiallyExpanded: false }, children: [text('in', 'inside')] }])
    const document = documentOf([{ screenId: 's', name: 'S', root }])
    const view = render(<HotlayoutScreen document={document} onReport={silent()} />)
    expect(screen.queryByText('inside')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'acc' }))
    expect(screen.getByText('inside')).toBeDefined()
    // New host data does not reset the block state.
    act(() => {
      view.rerender(<HotlayoutScreen document={document} data={{ 'user.points': 1 }} onReport={silent()} />)
    })
    expect(screen.getByText('inside')).toBeDefined()
  })
})

describe('layout checked against the builder by numbers', () => {
  it('a vertical spacer has a minimum height of `lg`, like a vertical divider; a horizontal one does not', () => {
    const spacer = (id: string, orientation: string): UiNode => ({ id, type: 'Spacer', props: { size: 'sm', orientation } })
    const divider: UiNode = { id: 'line', type: 'Divider', props: { orientation: 'vertical' } }
    const row: UiNode = { id: 'row', type: 'Row', props: { gap: 'sm', align: 'center', justify: 'start', wrap: false }, children: [spacer('upright', 'vertical'), divider] }
    const view = render(<HotlayoutScreen document={documentOf([{ screenId: 's', name: 'S', root: screenRoot('root', [row, spacer('flat', 'horizontal')]) }])} onReport={silent()} />)
    const node = (id: string): HTMLElement => view.container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)!
    expect(node('upright').style.minBlockSize).toBe('var(--product-space-lg)')
    expect(node('upright').style.inlineSize).toBe('var(--product-space-sm)')
    // The same measure as in the vertical divider line: two widgets of the same axis must not diverge.
    expect(node('line').querySelector<HTMLElement>('div')?.style.minBlockSize).toBe('var(--product-space-lg)')
    expect(node('flat').style.minBlockSize).toBe('')
    expect(node('flat').style.blockSize).toBe('var(--product-space-sm)')
  })
})
