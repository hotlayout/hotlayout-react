/**
 * Streaming server rendering: what a framework that streams (Next App Router, React Router) sends first.
 *
 * `renderToString` never defers anything, so it cannot tell whether the screen is in the first part of the response.
 * A streaming renderer may send a placeholder first and the content later, swapped in by a script: without JavaScript
 * the reader then sees only the placeholder. These tests read the shell: the response up to the first deferred segment.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { act } from 'react'
import type { ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToPipeableStream } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SRC_DIR, contractFile } from '../test-support/paths'
import { HOTLAYOUT_CSS, HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutReport, ThemeContract, UiDocument } from './index'

// act() of React 18 and 19 asks the test environment for this flag.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const json = <T,>(relative: string): T => JSON.parse(readFileSync(contractFile(relative), 'utf8')) as T
const SHOWCASE = json<UiDocument>('fixtures/rewards-showcase-screens.json')
const SHOWCASE_THEME = json<ThemeContract>('fixtures/themes/rewards-showcase-theme.json')
const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'getComputedStyle']
const UNAVAILABLE = 'This screen is not available right now.'

interface Streamed {
  /** The first part of the response: everything before the first deferred segment. */
  readonly shell: string
  /** The whole response. */
  readonly all: string
  /** Every error the renderer met, the recoverable ones too. */
  readonly errors: readonly unknown[]
  /** The shell itself could not be rendered: a framework answers with its error page. */
  readonly shellFailed: boolean
}

/** A deferred segment travels as a hidden element that a script moves into place: the shell ends where the first one starts. */
function shellOf(response: string): string {
  const deferred = response.search(/<div hidden(?:="")? id="S:/)
  return deferred === -1 ? response : response.slice(0, deferred)
}

/** Renders the way a streaming framework does, in an environment with no browser. */
async function stream(element: ReactNode): Promise<Streamed> {
  for (const name of BROWSER_GLOBALS) vi.stubGlobal(name, undefined)
  try {
    return await new Promise<Streamed>((resolve) => {
      const errors: unknown[] = []
      let all = ''
      const sink = new Writable({
        write(chunk: Buffer, _encoding, done) {
          all += chunk.toString('utf8')
          done()
        },
        final(done) {
          resolve({ shell: shellOf(all), all, errors, shellFailed: false })
          done()
        },
      })
      const { pipe } = renderToPipeableStream(element, {
        onError: (error) => {
          errors.push(error)
        },
        onShellError: () => {
          resolve({ shell: '', all, errors, shellFailed: true })
        },
        onShellReady: () => {
          pipe(sink)
        },
      })
    })
  } finally {
    vi.unstubAllGlobals()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('streaming server rendering', () => {
  const screen = <HotlayoutScreen document={SHOWCASE} theme={SHOWCASE_THEME} locale="en" onReport={() => undefined} />
  const rootId = SHOWCASE.screens.find((entry) => entry.screenId === SHOWCASE.initialScreenId)?.root.id ?? ''

  it('the screen is in the first part of the response, with no placeholder in its place', async () => {
    const { shell, all, errors, shellFailed } = await stream(<main>{screen}</main>)
    expect(errors).toEqual([])
    expect(shellFailed).toBe(false)
    expect(shell).toContain(`data-hl-node="${rootId}"`)
    expect(shell).not.toContain('role="alert"')
    expect(shell).not.toContain(UNAVAILABLE)
    // Nothing was deferred: the first part is the whole response, and no script has to swap anything in.
    expect(all).toBe(shell)
    expect(all).not.toContain('<script')
    expect(all).not.toContain('<!--$?-->')
  })

  it('a host page far larger than one streamed piece still carries the screen in the first part', async () => {
    const filler = Array.from({ length: 400 }, (_unused, index) => <p key={index}>{`A paragraph of the host page, number ${String(index)}, that comes before the screen.`}</p>)
    const { shell, all, errors } = await stream(
      <main>
        {filler}
        {screen}
      </main>,
    )
    expect(errors).toEqual([])
    expect(shell.length).toBeGreaterThan(20000)
    expect(shell).toContain(`data-hl-node="${rootId}"`)
    expect(all).not.toContain('role="alert"')
  })

  it('the streamed markup hydrates without a complaint', async () => {
    const { all } = await stream(screen)
    const hydrated = await hydrate(all, screen)
    expect(hydrated.recoverable).toEqual([])
    expect(hydrated.logged).toEqual([])
    expect(hydrated.container.querySelector('[role="alert"]')).toBeNull()
    expect(hydrated.container.querySelector(`[data-hl-node="${rootId}"]`)).not.toBeNull()
    hydrated.unmount()
  })
})

/** A document that throws DURING render: a getter on a field the widget reads. It stands for a shape the defensive read did not foresee. */
function throwingDocument(): UiDocument {
  const text = (id: string, value: string): unknown => ({ id, type: 'Text', props: { content: { kind: 'literal', value } } })
  const document = JSON.parse(
    JSON.stringify({
      schemaVersion: READER_SCHEMA_VERSION,
      documentId: 'doc',
      name: 'Doc',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children: [text('first', 'drawn before'), text('bad', 'the part that throws'), text('last', 'never reached')] } }],
    }),
  ) as UiDocument
  const bad = document.screens[0]?.root.children?.[1]
  if (bad !== undefined) {
    Object.defineProperty(bad.props, 'maxLines', {
      enumerable: true,
      get: () => {
        throw new Error('boom from the document')
      },
    })
  }
  return document
}

describe('streaming server rendering of a screen that throws', () => {
  it('the response is not lost: the notice is in the first part, the host page around it is whole, nothing is left to the browser', async () => {
    const { shell, all, errors, shellFailed } = await stream(
      <main>
        <h1>Bank</h1>
        <HotlayoutScreen document={throwingDocument()} onReport={() => undefined} />
        <footer>Host footer</footer>
      </main>,
    )
    expect(shellFailed).toBe(false)
    expect(errors).toEqual([])
    expect(all).toBe(shell)
    expect(shell).toContain('<h1>Bank</h1>')
    expect(shell).toContain('<footer>Host footer</footer>')
    expect(shell).toContain(`<div data-hl-failed=""><div role="alert">${UNAVAILABLE}</div></div>`)
    // The pass ends at the part that threw: neither it nor anything after it is drawn.
    expect(shell).not.toContain('the part that throws')
    expect(shell).not.toContain('never reached')
    // Not a boundary the browser has to render again.
    expect(all).not.toContain('<!--$!-->')
  })

  it('the stylesheet hides what was drawn before the part that threw', () => {
    expect(HOTLAYOUT_CSS).toContain(':has(> [data-hl-failed]) > :not([data-hl-failed]){display:none!important}')
  })

  it('renderError draws the notice on the server too, with the message of the exception', async () => {
    const { shell } = await stream(<HotlayoutScreen document={throwingDocument()} onReport={() => undefined} renderError={({ screenId, message }) => <p>{`${screenId}: ${message}`}</p>} />)
    expect(shell).toContain('<p>a: boom from the document</p>')
  })

  it('hydration finds what the server sent, then the error boundary takes the screen over and reports once', async () => {
    const reports: HotlayoutReport[] = []
    const document = throwingDocument()
    const element = (
      <main>
        <h1>Bank</h1>
        <HotlayoutScreen document={document} onReport={(report) => reports.push(report)} />
      </main>
    )
    const { all } = await stream(element)
    const hydrated = await hydrate(all, element)
    // The server markup was adopted, not thrown away: no mismatch and no switch to client rendering.
    expect(hydrated.recoverable).toEqual([])
    expect(hydrated.logged.filter((line) => /hydrat|did not match/i.test(line))).toEqual([])
    expect(hydrated.container.querySelector('h1')?.textContent).toBe('Bank')
    expect(hydrated.container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(hydrated.container.querySelector('[role="alert"]')?.textContent).toBe(UNAVAILABLE)
    expect(hydrated.container.textContent).not.toContain('drawn before')
    expect(reports.filter((report) => report.kind === 'render-error')).toEqual([{ kind: 'render-error', screenId: 'a', message: 'boom from the document' }])
    hydrated.unmount()
  })
})

describe('every component of the screen tree is guarded in the first pass', () => {
  const files = ['render.tsx', ...readdirSync(join(SRC_DIR, 'render')).map((name) => join('render', name))].filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))

  it.each(files)('%s declares its components through screenPart', (file) => {
    const source = readFileSync(join(SRC_DIR, file), 'utf8')
    // A component is a capitalised function; a plain declaration or an arrow would run unguarded on the server.
    const unguarded = [...source.matchAll(/^(?:export )?(?:default )?function ([A-Z]\w*)|^(?:export )?const ([A-Z]\w*) = (?:\(|<|memo\(|forwardRef\(|function)/gm)].map((match) => match[1] ?? match[2])
    expect(unguarded).toEqual([])
  })

  it('the files really hold the components the check is about', () => {
    const guarded = files.flatMap((file) => [...readFileSync(join(SRC_DIR, file), 'utf8').matchAll(/^(?:export )?const ([A-Z]\w*) = screenPart\(function \1\(/gm)])
    expect(guarded.length).toBeGreaterThan(40)
  })
})

interface Hydrated {
  readonly container: HTMLElement
  /** What React could recover from but had to report: a mismatch, a boundary rendered again in the browser. */
  readonly recoverable: readonly unknown[]
  /** Lines of `console.error`, without the one this environment causes itself. */
  readonly logged: readonly string[]
  readonly unmount: () => void
}

/** Hydrates the server markup the way a browser does. */
async function hydrate(markup: string, element: ReactNode): Promise<Hydrated> {
  const lines: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    lines.push(parts.map(String).join(' '))
  })
  const recoverable: unknown[] = []
  const container = document.createElement('div')
  container.innerHTML = markup
  document.body.append(container)
  let root: ReturnType<typeof hydrateRoot> | undefined
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: (error) => recoverable.push(error) })
    await Promise.resolve()
  })
  return {
    container,
    recoverable,
    /*
     * The streaming server renderer and the browser renderer both count as the primary one, and
     * here they ran in the same process, which React notices in development. A server and a browser
     * never share one.
     */
    logged: lines.filter((line) => !line.includes('multiple renderers concurrently rendering the same context provider')),
    unmount: () => {
      act(() => root?.unmount())
      container.remove()
    },
  }
}
