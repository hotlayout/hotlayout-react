/**
 * The node field `name` (schema 9.29.0) is a name for the author of the document, shown in the
 * editor's tree. Readers ignore it: it is not drawn, it is not part of an accessible name and it
 * does not change what the host receives. A document with names renders exactly like the same
 * document without them.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { HotlayoutAction, UiDocument } from './index'

afterEach(cleanup)

const NAMED = 'Mission card node name'

function documentOf(named: boolean): UiDocument {
  const name = (value: string): Record<string, unknown> => (named ? { name: value } : {})
  const title = { id: 'title', type: 'Text', props: { content: { kind: 'literal', value: 'Daily mission' } }, ...name(`${NAMED} title`) }
  const card = {
    id: 'card',
    type: 'Container',
    props: { action: { type: 'openUrl', params: { url: 'https://example.com/mission' } }, label: { kind: 'literal', value: 'Open mission' } },
    children: [title],
    ...name(NAMED),
  }
  return {
    schemaVersion: '9.29.0',
    documentId: 'doc',
    name: 'Doc',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children: [card] } }],
  } as unknown as UiDocument
}

describe('node name is editor-only', () => {
  it('renders the same markup with and without names, and never shows the name', () => {
    const reports: Record<'named' | 'plain', string[]> = { named: [], plain: [] }
    const named = renderToString(<HotlayoutScreen document={documentOf(true)} injectStyles={false} onReport={(report) => reports.named.push(report.kind)} />)
    const plain = renderToString(<HotlayoutScreen document={documentOf(false)} injectStyles={false} onReport={(report) => reports.plain.push(report.kind)} />)
    expect(named).toBe(plain)
    expect(named).not.toContain(NAMED)
    expect(reports.named).toEqual(reports.plain)
  })

  it('keeps the accessible name and the action the host receives', async () => {
    const actions: HotlayoutAction[] = []
    render(<HotlayoutScreen document={documentOf(true)} onAction={(action) => actions.push(action)} />)
    const card = screen.getByRole('button', { name: /Open mission/ })
    expect(card.getAttribute('aria-label') ?? card.textContent).not.toContain(NAMED)
    await userEvent.click(card)
    expect(actions).toHaveLength(1)
    expect(JSON.stringify(actions[0])).not.toContain(NAMED)
  })
})
