/**
 * RICH TEXT KEEPS THE NODE FONT when the tallest line belongs to the base style, not to a span.
 *
 * Fixture `rich-text-screens`, the row "Earn double points this weekend"
 * (`style.typography: 'titleS'`, span `word` is the same `titleS`, only bolder). The whole row must
 * be 16 px / 500, not "Earn … points this weekend" at 14 px / 400 (the default `bodyM`) with only
 * the word "double" at 16 px.
 *
 * The expectation is what MUST hold: text outside spans is drawn in the node font.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'

afterEach(cleanup)

function documentWith(text: Record<string, unknown>): UiDocument {
  return {
    schemaVersion: '9.6.0',
    documentId: 'rich-base-style',
    name: 'Rich',
    initialScreenId: 'main',
    screens: [
      {
        screenId: 'main',
        name: 'Main',
        root: { id: 'root', type: 'Screen', props: {}, children: [text] },
      },
    ],
  } as unknown as UiDocument
}

/** The font in which the BARE paragraph text (outside spans) is drawn: the paragraph's own style or the piece wrapper's. */
function baseFontSizeOf(paragraph: HTMLElement, sample: string): string {
  for (const child of paragraph.childNodes) {
    if (child.nodeType === 3 && (child.textContent ?? '').includes(sample)) return paragraph.style.fontSize
    if (child instanceof HTMLElement && child.textContent.includes(sample)) return child.style.fontSize || paragraph.style.fontSize
  }
  return ''
}

describe('rich text: base text is drawn in the node font', () => {
  it('node font titleS, span is the same titleS but bolder: "Earn … points" stays titleS', () => {
    const view = render(
      <HotlayoutScreen
        document={documentWith({
          id: 'offer',
          type: 'Text',
          props: {
            content: { kind: 'template', template: 'Earn {word} points this weekend', values: { word: { kind: 'text', text: 'double' } } },
            align: 'start',
            overflow: 'ellipsis',
            spans: { word: { color: 'primary', typography: { token: 'titleS', fontWeight: 700 } } },
          },
          style: { typography: 'titleS' },
        })}
        onReport={() => undefined}
      />,
    )
    const paragraph = view.container.querySelector<HTMLElement>('[data-hl-node="offer"]')
    expect(paragraph).not.toBeNull()
    expect(baseFontSizeOf(paragraph!, 'Earn')).toContain('title-s')
  })

  it('node font titleM, span SMALLER (bodyS): the rest of the row stays titleM', () => {
    const view = render(
      <HotlayoutScreen
        document={documentWith({
          id: 'line',
          type: 'Text',
          props: {
            content: { kind: 'template', template: 'Total {note}', values: { note: { kind: 'text', text: 'incl. tax' } } },
            align: 'start',
            overflow: 'ellipsis',
            spans: { note: { color: 'muted', typography: 'bodyS' } },
          },
          style: { typography: 'titleM' },
        })}
        onReport={() => undefined}
      />,
    )
    const paragraph = view.container.querySelector<HTMLElement>('[data-hl-node="line"]')
    expect(paragraph).not.toBeNull()
    expect(baseFontSizeOf(paragraph!, 'Total')).toContain('title-m')
  })
})
