/**
 * ACCESSIBILITY OF THE PACKAGE: keyboard, focus, roles and accessible names.
 *
 * An embedded screen must be operable from the keyboard and readable by a screen reader without
 * a single line of host code. So these tests check BEHAVIOUR (where focus went, what opened after
 * an arrow key), not the presence of attributes: an attribute without behaviour is a promise
 * nobody keeps.
 *
 * jsdom computes no layout and no `:focus-visible`, so the focus ring is checked here only as a
 * stylesheet rule.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HOTLAYOUT_CSS, HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutAction, UiDocument, UiNode } from './index'
import { FOCUSABLE_CLASS, PRESSABLE_CLASS } from './styles'

afterEach(cleanup)

const lit = (value: string) => ({ kind: 'literal', value }) as const
const text = (id: string, value: string): UiNode => ({ id, type: 'Text', props: { content: lit(value) } })
const button = (id: string, label: string, action: HotlayoutAction): UiNode => ({ id, type: 'Button', props: { label: lit(label), variant: 'primary', action, fullWidth: false } })
const screenRoot = (id: string, children: readonly UiNode[]): UiNode => ({ id, type: 'Screen', props: {}, children })
const documentOf = (screens: UiDocument['screens'], extra: Partial<UiDocument> = {}): UiDocument => ({
  schemaVersion: READER_SCHEMA_VERSION,
  documentId: 'doc',
  name: 'Doc',
  initialScreenId: screens[0]?.screenId ?? '',
  screens,
  ...extra,
})
const single = (children: readonly UiNode[], extra: Partial<UiDocument> = {}): UiDocument => documentOf([{ screenId: 's', name: 'S', root: screenRoot('root', children) }], extra)
const silent = (): void => undefined
const focused = (): Element | null => document.activeElement

describe('tabs: WAI-ARIA Tabs pattern', () => {
  const tab = (id: string): UiNode => ({ id, type: 'Tab', props: { title: lit(`title-${id}`) }, children: [text(`${id}-body`, `body-${id}`)] })
  const tabsDocument = (extra: Partial<UiDocument> = {}): UiDocument => single([{ id: 'tabs', type: 'Tabs', props: { initialTab: 0 }, children: [tab('t1'), tab('t2'), tab('t3')] }], extra)
  const titles = (): HTMLElement[] => screen.getAllByRole('tab')
  const selected = (): string | undefined => titles().find((title) => title.getAttribute('aria-selected') === 'true')?.textContent

  it('the strip, the titles and the panel are linked: tablist → tab (aria-controls) → tabpanel (aria-labelledby)', () => {
    render(<HotlayoutScreen document={tabsDocument()} onReport={silent} />)
    expect(screen.getByRole('tablist')).toBeDefined()
    const [first] = titles()
    const panel = screen.getByRole('tabpanel')
    expect(first?.id).not.toBe('')
    expect(first?.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(first?.id)
    // The panel is the tab NODE itself, not a wrapper around it: an extra box would shift the layout.
    expect(panel.getAttribute('data-hl-node')).toBe('t1')
    // Closed tabs have no panel, so there is nothing for them to point at.
    expect(titles()[1]?.getAttribute('aria-controls')).toBeNull()
  })

  it('the strip has ONE Tab stop, the open tab; the rest are reached with arrow keys', () => {
    render(<HotlayoutScreen document={tabsDocument()} onReport={silent} />)
    expect(titles().map((title) => title.tabIndex)).toEqual([0, -1, -1])
    fireEvent.click(titles()[2]!)
    expect(titles().map((title) => title.tabIndex)).toEqual([-1, -1, 0])
  })

  it('arrows wrap around, open the panel and move focus with them; Home / End jump to the ends', () => {
    render(<HotlayoutScreen document={tabsDocument()} onReport={silent} />)
    titles()[0]?.focus()

    fireEvent.keyDown(focused()!, { key: 'ArrowRight' })
    expect(selected()).toBe('title-t2')
    expect(focused()).toBe(titles()[1])
    expect(screen.getByText('body-t2')).toBeDefined()
    expect(screen.queryByText('body-t1')).toBeNull()

    fireEvent.keyDown(focused()!, { key: 'End' })
    expect(selected()).toBe('title-t3')
    fireEvent.keyDown(focused()!, { key: 'ArrowRight' })
    expect(selected()).toBe('title-t1')
    expect(focused()).toBe(titles()[0])
    fireEvent.keyDown(focused()!, { key: 'ArrowLeft' })
    expect(selected()).toBe('title-t3')
    fireEvent.keyDown(focused()!, { key: 'Home' })
    expect(selected()).toBe('title-t1')
  })

  it('an arrow the strip handled does not reach the page; any other key is left alone', () => {
    render(<HotlayoutScreen document={tabsDocument()} onReport={silent} />)
    titles()[0]?.focus()
    // `fireEvent` returns false when the handler called `preventDefault`.
    expect(fireEvent.keyDown(focused()!, { key: 'ArrowRight' })).toBe(false)
    expect(fireEvent.keyDown(focused()!, { key: 'a' })).toBe(true)
    expect(selected()).toBe('title-t2')
  })

  it('right-to-left writing: arrows swap, so "left" goes to the NEXT tab', () => {
    render(<HotlayoutScreen document={tabsDocument()} dir="rtl" onReport={silent} />)
    titles()[0]?.focus()
    fireEvent.keyDown(focused()!, { key: 'ArrowLeft' })
    expect(selected()).toBe('title-t2')
    fireEvent.keyDown(focused()!, { key: 'ArrowRight' })
    expect(selected()).toBe('title-t1')
  })

  it('two strips on a page share no ids, even with identical tab ids in both instances', () => {
    render(
      <>
        <HotlayoutScreen document={tabsDocument()} onReport={silent} />
        <HotlayoutScreen document={tabsDocument({ documentId: 'other' })} onReport={silent} />
      </>,
    )
    const ids = titles().map((title) => title.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a tab title has a visible focus ring and does not widen the touch target', () => {
    render(<HotlayoutScreen document={tabsDocument()} onReport={silent} />)
    for (const title of titles()) {
      expect(title.classList.contains(FOCUSABLE_CLASS)).toBe(true)
      expect(title.classList.contains(PRESSABLE_CLASS)).toBe(false)
    }
    expect(HOTLAYOUT_CSS).toContain(`.${FOCUSABLE_CLASS}:focus-visible{outline:2px solid`)
    expect(HOTLAYOUT_CSS).toContain(`.${PRESSABLE_CLASS}:focus-visible{outline:2px solid`)
  })
})

describe('buttons and rows with an action: keyboard use', () => {
  it('the button, the accordion header and the back arrow are real <button type="button">: the browser provides Enter and Space', () => {
    const root = [
      { id: 'bar', type: 'AppBar', props: { title: lit('bar'), showBack: true } },
      button('go', 'go', { type: 'submit' }),
      { id: 'faq', type: 'Accordion', props: { title: lit('faq'), initiallyExpanded: false }, children: [text('answer', 'answer')] },
    ] satisfies UiNode[]
    render(<HotlayoutScreen document={single(root)} onReport={silent} />)
    for (const name of ['Back', 'go', 'faq']) {
      const element = screen.getByRole('button', { name })
      expect(element.tagName).toBe('BUTTON')
      expect(element.getAttribute('type')).toBe('button')
      expect(element.classList.contains(PRESSABLE_CLASS)).toBe(true)
      // Everything is reachable with Tab: no button has a negative tabindex.
      expect(element.tabIndex).toBe(0)
    }
  })

  it('a row with an action: button role, Tab stop; Enter and Space run the action and do not scroll the page', () => {
    const actions: HotlayoutAction[] = []
    const row: UiNode = { id: 'row', type: 'ListTile', props: { title: lit('row'), leading: { kind: 'none' }, trailing: { kind: 'chevron' }, action: { type: 'open' } } }
    render(<HotlayoutScreen document={single([row])} onAction={(action) => actions.push(action)} onReport={silent} />)
    const element = screen.getByRole('button', { name: /row/ })
    expect(element.tabIndex).toBe(0)
    expect(fireEvent.keyDown(element, { key: ' ' })).toBe(false)
    expect(fireEvent.keyDown(element, { key: 'Enter' })).toBe(false)
    expect(fireEvent.keyDown(element, { key: 'a' })).toBe(true)
    expect(actions).toEqual([{ type: 'open' }, { type: 'open' }])
  })

  it('the accordion reports its state: aria-expanded changes together with the content', () => {
    const faq: UiNode = { id: 'faq', type: 'Accordion', props: { title: lit('faq'), initiallyExpanded: false }, children: [text('answer', 'answer')] }
    render(<HotlayoutScreen document={single([faq])} onReport={silent} />)
    const header = screen.getByRole('button', { name: 'faq' })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('answer')).toBeNull()
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('answer')).toBeDefined()
  })

  it('a choice-group option is a radio in a radiogroup; Space selects it', () => {
    const option = (id: string): UiNode => ({ id, type: 'ListTile', props: { title: lit(id), leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: id } } })
    const group: UiNode = { id: 'group', type: 'ChoiceGroup', props: { value: lit('one'), gap: 'none' }, children: [option('one'), option('two')] }
    render(<HotlayoutScreen document={single([group])} onReport={silent} />)
    expect(screen.getByRole('radiogroup')).toBeDefined()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, 0])
    fireEvent.keyDown(radios[1]!, { key: ' ' })
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true'])
  })
})

describe('accessible names', () => {
  it('the back arrow is named by the host text (labels.back), Back by default', () => {
    const bar: UiNode = { id: 'bar', type: 'AppBar', props: { title: lit('bar'), showBack: true } }
    const view = render(<HotlayoutScreen document={single([bar])} onReport={silent} />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDefined()
    view.rerender(<HotlayoutScreen document={single([bar])} labels={{ back: 'رجوع' }} onReport={silent} />)
    expect(screen.getByRole('button', { name: 'رجوع' })).toBeDefined()
  })

  it('an image carries the document’s alt; an image without alt is decoration and a screen reader skips it', () => {
    const image = (id: string, alt: string | undefined, source: object): UiNode => ({ id, type: 'Image', props: { source, aspectRatio: '1:1', ...(alt === undefined ? {} : { alt }) } })
    render(
      <HotlayoutScreen
        document={single([
          image('photo', 'A cup of coffee', { kind: 'url', url: 'https://cdn.example.com/cup.png' }),
          image('logo', 'Bank logo', { kind: 'asset', asset: 'logo' }),
          image('deco', undefined, { kind: 'asset', asset: 'banner' }),
        ])}
        onReport={silent}
      />,
    )
    const photo = screen.getByRole('img', { name: 'A cup of coffee' })
    expect(photo.tagName).toBe('IMG')
    // An asset without an address renders as a placeholder and stays an image with the same name.
    expect(screen.getByRole('img', { name: 'Bank logo' }).tagName).toBe('DIV')
    expect(document.querySelector('[data-hl-node="deco"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('an address that failed to load becomes a placeholder with the same name, not a broken-image icon', () => {
    const image: UiNode = { id: 'photo', type: 'Image', props: { source: { kind: 'binding', path: 'item.image', fallback: 'placeholder' }, alt: 'Reward', aspectRatio: '16:9' } }
    const view = render(<HotlayoutScreen document={single([image])} data={{ 'item.image': 'https://cdn.example.com/gone.png' }} onReport={silent} />)
    fireEvent.error(screen.getByRole('img', { name: 'Reward' }))
    const placeholder = screen.getByRole('img', { name: 'Reward' })
    expect(placeholder.tagName).toBe('DIV')
    expect(placeholder.getAttribute('data-hl-image')).toBe('failed')
    expect(placeholder.getAttribute('data-hl-node')).toBe('photo')

    // A different address (new data) tries loading again: we remember the failed ADDRESS, not the node.
    view.rerender(<HotlayoutScreen document={single([image])} data={{ 'item.image': 'https://cdn.example.com/new.png' }} onReport={silent} />)
    expect(screen.getByRole('img', { name: 'Reward' }).tagName).toBe('IMG')
  })
})

describe('modal screen: WAI-ARIA Dialog (Modal) pattern', () => {
  function modalDocument(): UiDocument {
    return documentOf([
      { screenId: 'page', name: 'Page', root: screenRoot('page-root', [button('before', 'before', { type: 'x' }), button('open', 'open', { type: 'navigate', params: { screenId: 'sheet' } })]) },
      {
        screenId: 'sheet',
        name: 'Reward',
        presentation: 'modal',
        root: screenRoot('sheet-root', [text('sheet-text', 'sheet'), button('first', 'first', { type: 'x' }), button('close', 'close', { type: 'navigate.back' })]),
      },
      { screenId: 'empty', name: 'Empty', presentation: 'modal', root: screenRoot('empty-root', [text('empty-text', 'nothing to press')]) },
    ])
  }
  const open = (): void => {
    const opener = screen.getByRole('button', { name: 'open' })
    opener.focus()
    fireEvent.click(opener)
  }
  const pageLayer = (): Element | null => document.querySelector('[data-hl-screen="page"]')

  it('on open, focus moves into the dialog and the screen under it becomes inert', () => {
    render(<HotlayoutScreen document={modalDocument()} onReport={silent} />)
    expect(pageLayer()?.hasAttribute('inert')).toBe(false)
    open()
    const dialog = screen.getByRole('dialog', { name: 'Reward' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(focused()).toBe(dialog)
    expect(pageLayer()?.hasAttribute('inert')).toBe(true)
  })

  it('Tab and Shift+Tab cycle inside the dialog', () => {
    render(<HotlayoutScreen document={modalDocument()} onReport={silent} />)
    open()
    const first = screen.getByRole('button', { name: 'first' })
    const last = screen.getByRole('button', { name: 'close' })

    // From the last control to the first.
    last.focus()
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false)
    expect(focused()).toBe(first)
    // From the first control back to the last; the same from the sheet itself, where focus lands on open.
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(focused()).toBe(last)
    const dialog = screen.getByRole('dialog')
    dialog.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(focused()).toBe(last)
    // Inside the cycle the browser moves focus itself: the handler does not interfere.
    first.focus()
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true)
  })

  // Changed in 0.25.0: a dialog with nothing to focus no longer swallows Tab by default (WCAG 2.1.2); only the host's `trapFocus` does.
  it('a dialog with no controls lets Tab leave the package by default and keeps it only with trapFocus', () => {
    const document_ = modalDocument()
    const withLink: UiDocument = {
      ...document_,
      screens: document_.screens.map((entry) => (entry.screenId === 'page' ? { ...entry, root: screenRoot('page-root', [button('open', 'open', { type: 'navigate', params: { screenId: 'empty' } })]) } : entry)),
    }
    const { unmount } = render(<HotlayoutScreen document={withLink} onReport={silent} />)
    open()
    const dialog = screen.getByRole('dialog', { name: 'Empty' })
    expect(focused()).toBe(dialog)
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true)
    unmount()
    render(<HotlayoutScreen document={withLink} onReport={silent} trapFocus />)
    open()
    const trapped = screen.getByRole('dialog', { name: 'Empty' })
    expect(fireEvent.keyDown(trapped, { key: 'Tab' })).toBe(false)
    expect(focused()).toBe(trapped)
  })

  it('Esc closes the dialog with the same `navigate.back`, returns focus to what opened it, and removes inert', () => {
    const navigations: string[] = []
    render(
      <HotlayoutScreen
        document={modalDocument()}
        onNavigate={(event) => {
          navigations.push(`${event.kind}:${event.action.type}`)
          return undefined
        }}
        onReport={silent}
      />,
    )
    open()
    fireEvent.keyDown(focused()!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(navigations).toEqual(['push:navigate', 'back:navigate.back'])
    expect(focused()).toBe(screen.getByRole('button', { name: 'open' }))
    expect(pageLayer()?.hasAttribute('inert')).toBe(false)
  })

  it('a host that cancelled the return (onNavigate → false) keeps the dialog open after Esc', () => {
    render(<HotlayoutScreen document={modalDocument()} onNavigate={(event) => (event.kind === 'back' ? false : undefined)} onReport={silent} />)
    open()
    fireEvent.keyDown(focused()!, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Reward' })).toBeDefined()
    expect(pageLayer()?.hasAttribute('inert')).toBe(true)
  })
})

describe('focus after moving between pages', () => {
  function pages(): UiDocument {
    return documentOf([
      { screenId: 'a', name: 'A', root: screenRoot('a-root', [button('to-b', 'to-b', { type: 'navigate', params: { screenId: 'b' } })]) },
      { screenId: 'b', name: 'B', root: screenRoot('b-root', [button('back', 'back', { type: 'navigate.back' })]) },
    ])
  }

  it('the first screen does not take focus: the user may be typing on the host page', () => {
    render(
      <>
        <input aria-label="host-field" />
        <HotlayoutScreen document={pages()} onReport={silent} />
      </>,
    )
    const field = screen.getByLabelText('host-field')
    field.focus()
    expect(focused()).toBe(field)
    expect(document.querySelector('[data-hl-screen="a"]')?.contains(focused())).toBe(false)
  })

  it('after a transition focus lands on the new screen, not on <body>; the same after going back', () => {
    render(<HotlayoutScreen document={pages()} onReport={silent} />)
    const opener = screen.getByRole('button', { name: 'to-b' })
    opener.focus()
    fireEvent.click(opener)
    expect(focused()).toBe(document.querySelector('[data-hl-screen="b"]'))
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(focused()).toBe(document.querySelector('[data-hl-screen="a"]'))
  })

  it('a host that changed the entry does not lose focus: the stack is new and the user has not moved it', () => {
    const document_ = { ...pages(), entryPoints: { second: 'b' } }
    const view = render(
      <>
        <input aria-label="host-field" />
        <HotlayoutScreen document={document_} onReport={silent} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'to-b' }))
    const field = screen.getByLabelText('host-field')
    field.focus()
    view.rerender(
      <>
        <input aria-label="host-field" />
        <HotlayoutScreen document={document_} entry="second" onReport={silent} />
      </>,
    )
    expect(focused()).toBe(field)
  })
})

describe('date time zone: server and browser write the same text', () => {
  const dated = single([{ id: 'when', type: 'Text', props: { content: { kind: 'binding', path: 'campaign.endsAt', fallback: '—', format: 'dateTime' } } }], {
    localization: { defaultLocale: 'en', locales: ['en'], strings: {} },
  })
  const data = { 'campaign.endsAt': '2026-10-31T23:30:00.000Z' }
  const shown = (timeZone: string | undefined): string => {
    const view = render(<HotlayoutScreen document={dated} data={data} timeZone={timeZone} onReport={silent} />)
    const value = view.container.querySelector('[data-hl-node="when"]')?.textContent ?? ''
    view.unmount()
    return value
  }

  it('the same instant in two zones gives two different texts: this is what breaks hydration without the prop', () => {
    expect(shown('UTC')).toContain('Oct 31')
    expect(shown('Asia/Dubai')).toContain('Nov 1')
  })

  it('with the `timeZone` prop the server markup contains the same text the browser renders', () => {
    const html = renderToString(<HotlayoutScreen document={dated} data={data} timeZone="Asia/Dubai" onReport={silent} />)
    expect(html).toContain(shown('Asia/Dubai'))
  })

  it('a zone the environment does not know does not turn the date into raw ISO: the device zone applies', () => {
    const value = shown('Mars/Olympus')
    expect(value).not.toContain('T23:30')
    expect(value).toMatch(/2026/)
    expect(value).toBe(shown(undefined))
  })
})

describe('reader clock: server and browser count the same days', () => {
  const counted = single([{ id: 'left', type: 'Text', props: { content: { kind: 'template', template: '{days} {unit} left', values: { days: { kind: 'binding', path: 'campaign.endsAt', fallback: '—', format: 'daysUntil' }, unit: { kind: 'plural', of: 'days', forms: { one: 'day', other: 'days' } } } } } }], {
    localization: { defaultLocale: 'en', locales: ['en'], strings: {} },
  })
  const data = { 'campaign.endsAt': '2026-10-14T09:00:00.000Z' }
  // The server rendered one second BEFORE the day boundary, the browser hydrates one second AFTER.
  const server = Date.parse('2026-10-11T08:59:59.000Z')
  const browser = Date.parse('2026-10-11T09:00:01.000Z')
  const shown = (now: number | Date | undefined): string => {
    const view = render(<HotlayoutScreen document={counted} data={data} now={now} onReport={silent} />)
    const value = view.container.querySelector('[data-hl-node="left"]')?.textContent ?? ''
    view.unmount()
    return value
  }

  it('two instants on either side of a day boundary give two different texts: this is what breaks hydration without the prop', () => {
    expect(shown(server)).toBe('4 days left')
    expect(shown(browser)).toBe('3 days left')
  })

  it('with the `now` prop the server markup contains the same text the browser renders', () => {
    const html = renderToString(<HotlayoutScreen document={counted} data={data} now={server} onReport={silent} />)
    expect(html).toContain('4 days left')
    expect(shown(server)).toBe('4 days left')
    // A `Date` and a number are the same instant.
    expect(shown(new Date(server))).toBe('4 days left')
  })

  it('the time zone does not enter the day count: the same text for any `timeZone`', () => {
    for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Mars/Olympus']) {
      const view = render(<HotlayoutScreen document={counted} data={data} now={server} timeZone={timeZone} onReport={silent} />)
      expect(view.container.querySelector('[data-hl-node="left"]')?.textContent, timeZone).toBe('4 days left')
      view.unmount()
    }
  })

  it('without the prop the clock of whoever renders is read at render time; a "now" of the wrong shape falls back to it too', () => {
    vi.useFakeTimers({ now: browser, toFake: ['Date'] })
    try {
      expect(shown(undefined)).toBe('3 days left')
      expect(shown(Number.NaN)).toBe('3 days left')
      expect(shown(new Date('not a date'))).toBe('3 days left')
      expect(shown('2026-10-11' as unknown as number)).toBe('3 days left')
      // The screen does not count down by itself: time passed, the text is the same until it is rendered again.
      const view = render(<HotlayoutScreen document={counted} data={data} onReport={silent} />)
      vi.setSystemTime(browser + 3 * 86_400_000)
      expect(view.container.querySelector('[data-hl-node="left"]')?.textContent).toBe('3 days left')
      view.rerender(<HotlayoutScreen document={counted} data={data} onReport={silent} />)
      expect(view.container.querySelector('[data-hl-node="left"]')?.textContent).toBe('0 days left')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('icon button and icon inside a button (schema 9.5.0): keyboard and screen reader', () => {
  const iconButton = (id: string, props: Record<string, unknown>): UiNode => ({ id, type: 'IconButton', props: { icon: 'arrow-left', label: lit('Back'), variant: 'ghost', size: 'md', action: { type: 'share' }, ...props } })
  const withIcon = (id: string, label: string, action: HotlayoutAction): UiNode => ({ id, type: 'Button', props: { label: lit(label), variant: 'primary', action, fullWidth: false, icon: 'gift', iconPosition: 'start' } })
  const chip: UiNode = { id: 'chip', type: 'Badge', props: { label: lit('52 days left'), tone: 'warning', icon: 'clock' } }

  it('Tab reaches the icon button in document order; a badge with an icon is not a stop', async () => {
    const user = userEvent.setup()
    render(<HotlayoutScreen document={single([iconButton('back', {}), chip, withIcon('redeem', 'Redeem', { type: 'submit' }), iconButton('info', { icon: 'info', label: lit('About') })])} onReport={silent} />)
    const stops: (string | null)[] = []
    for (let step = 0; step < 3; step += 1) {
      await user.tab()
      stops.push(focused()?.getAttribute('data-hl-node') ?? null)
    }
    expect(stops).toEqual(['back', 'redeem', 'info'])
    // A real button: it takes focus without `tabindex`; the focus ring comes from the pressable-area class.
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.tagName).toBe('BUTTON')
    expect(back.getAttribute('type')).toBe('button')
    expect(back.getAttribute('tabindex')).toBeNull()
    expect(back.classList.contains(PRESSABLE_CLASS)).toBe(true)
    expect(HOTLAYOUT_CSS).toContain(`.${PRESSABLE_CLASS}:focus-visible{outline:2px solid`)
  })

  it('Enter and Space run the icon button’s action, the same as a click; the host receives the node and the screen', async () => {
    const user = userEvent.setup()
    const actions: string[] = []
    render(
      <HotlayoutScreen
        document={single([iconButton('back', {})])}
        onAction={(action, source) => actions.push(`${action.type}@${source.screenId}/${source.nodeId}`)}
        onReport={silent}
      />,
    )
    await user.tab()
    expect(focused()).toBe(screen.getByRole('button', { name: 'Back' }))
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(actions).toEqual(['share@s/back', 'share@s/back', 'share@s/back'])
  })

  it('an icon button navigates between screens like a button: `navigate` and `navigate.back`', async () => {
    const user = userEvent.setup()
    const document_ = documentOf([
      { screenId: 'a', name: 'A', root: screenRoot('a-root', [text('a-text', 'screen-a'), iconButton('next', { icon: 'arrow-right', label: lit('Next'), action: { type: 'navigate', params: { screenId: 'b' } } })]) },
      { screenId: 'b', name: 'B', root: screenRoot('b-root', [text('b-text', 'screen-b'), iconButton('back', { action: { type: 'navigate.back' } })]) },
    ])
    render(<HotlayoutScreen document={document_} onReport={silent} />)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByText('screen-b')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('screen-a')).toBeDefined()
    expect(screen.queryByText('screen-b')).toBeNull()
  })

  it('a screen reader hears the name: the translated label; the glyph is hidden from it; the name is not visible on screen', () => {
    const localized = single([iconButton('back', {})], { localization: { defaultLocale: 'en', locales: ['en', 'uk', 'ar'], strings: { uk: { 's/back/label': 'Назад' }, ar: { 's/back/label': 'رجوع' } } } })
    const view = render(<HotlayoutScreen document={localized} locale="uk-UA" onReport={silent} />)
    const back = screen.getByRole('button', { name: 'Назад' })
    expect(back.textContent).toBe('')
    // Everything inside the button is decoration: a screen reader hears only the name.
    for (const child of back.querySelectorAll('*')) expect(child.closest('[aria-hidden="true"]')).not.toBeNull()
    view.rerender(<HotlayoutScreen document={localized} locale="ar-EG" onReport={silent} />)
    expect(screen.getByRole('button', { name: 'رجوع' })).toBeDefined()
    // A directional icon is flipped exactly once in RTL; the name does not depend on that.
    expect(screen.getByRole('button', { name: 'رجوع' }).outerHTML.match(/scale: -1 1/g)).toHaveLength(1)
  })

  it('a button with an icon: the name is the label only; the icon is hidden and never takes focus', () => {
    render(<HotlayoutScreen document={single([withIcon('redeem', 'Redeem', { type: 'submit' })])} onReport={silent} />)
    const redeem = screen.getByRole('button', { name: 'Redeem' })
    expect(redeem.getAttribute('aria-label')).toBeNull()
    const icon = redeem.querySelector('[data-hl-beside="icon"]')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.querySelector('[tabindex], button, a')).toBeNull()
    // A badge with an icon is text: it does not get the button role.
    cleanup()
    render(<HotlayoutScreen document={single([chip])} onReport={silent} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('52 days left')).toBeDefined()
  })

  it('an icon button without a name: still a button, takes focus, runs its action; the icon’s name in words becomes the name', async () => {
    const user = userEvent.setup()
    const actions: string[] = []
    render(<HotlayoutScreen document={single([iconButton('close', { icon: 'chevron-left', label: lit('  ') })])} onAction={(action) => actions.push(action.type)} onReport={silent} />)
    await user.tab()
    expect(focused()).toBe(screen.getByRole('button', { name: 'chevron left' }))
    await user.keyboard('{Enter}')
    expect(actions).toEqual(['share'])
  })
})
