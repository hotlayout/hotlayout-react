/** README examples: what a document can ask of the host and how the host restricts it. */
import { useState } from 'react'

import { HotlayoutScreen } from '@hotlayout/react'
import type { DataScope, UiDocument } from '@hotlayout/react'

/** Your bundler's development flag (`import.meta.env.DEV`, `process.env.NODE_ENV !== 'production'`). */
declare const IS_DEVELOPMENT: boolean

// #region write
/** The only paths this screen may write to — from your project's data dictionary. */
const WRITABLE = ['item.selectedId', 'survey.answer'] as const

export function Survey({ layout, initial }: { layout: UiDocument; initial: DataScope }) {
  const [data, setData] = useState<DataScope>(initial)
  return (
    <HotlayoutScreen
      document={layout}
      data={data}
      writablePaths={WRITABLE}
      onWrite={(path, value) => {
        // A FLAT map keyed by the path — never `lodash.set(state, path, value)`:
        // the path is chosen by the document, and a deep setter turns it into a property walk.
        setData((current) => ({ ...current, [path]: value }))
      }}
    />
  )
}
// #endregion

// #region images
const IMAGE_HOSTS = new Set(['cdn.example.com', 'images.example.com'])

export function OwnImagesOnly({ layout }: { layout: UiDocument }) {
  return (
    <HotlayoutScreen
      document={layout}
      resolveImageUrl={(url, { allowedByDefault }) => {
        if (IS_DEVELOPMENT && url.startsWith('http://localhost:')) return url
        // `allowedByDefault` is true for an absolute https: address — the renderer's own rule.
        return allowedByDefault && IMAGE_HOSTS.has(new URL(url).hostname) ? url : null
      }}
      onReport={(report) => {
        if (report.kind === 'ignored-input') console.warn('layout input ignored:', report.where, report.reason)
      }}
    />
  )
}
// #endregion
