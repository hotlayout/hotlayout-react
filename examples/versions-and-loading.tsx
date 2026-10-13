/** README examples: version compatibility and updating a document without rebuilding the application. */
import { useEffect, useState } from 'react'

import { HotlayoutScreen, READER_SCHEMA_VERSION, checkDocumentVersion, loadDocument } from '@hotlayout/react'
import type { ThemeContract, UiDocument } from '@hotlayout/react'

// #region version
checkDocumentVersion('9.0.0') // { kind: 'compatible' }
checkDocumentVersion('9.99.0') // { kind: 'newer-minor', documentVersion: '9.99.0' } — drawn, the unknown is skipped
checkDocumentVersion('10.0.0') // { kind: 'incompatible', reason: 'major 10 is not readable by a major-9 reader', relation: 'document-newer' }
console.log(`this build reads schema ${READER_SCHEMA_VERSION}`)
// #endregion

// #region incompatible
export function Guarded({ layout }: { layout: UiDocument }) {
  return (
    <HotlayoutScreen
      document={layout}
      renderIncompatible={(verdict) =>
        verdict.relation === 'document-newer' ? (
          <p role="alert">Please update the app to see this screen.</p>
        ) : (
          <p role="alert">This screen is not available right now.</p>
        )
      }
      onReport={(report) => {
        if (report.kind === 'incompatible-document') console.error('layout refused', report.documentVersion, report.readerVersion, report.reason)
      }}
    />
  )
}
// #endregion

// #region live-document
/** The published layout, re-read whenever the user comes back to the tab. */
export function useLayout(url: string): UiDocument | undefined {
  const [layout, setLayout] = useState<UiDocument>()
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      loadDocument(url, { bypassCache: true, signal: controller.signal })
        .then((next) => {
          // A layout this build cannot read does not replace the one on screen.
          if (checkDocumentVersion(next.schemaVersion).kind !== 'incompatible') setLayout(next)
        })
        .catch(() => undefined) // offline or a bad deploy: keep showing what we have
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url])
  return layout
}

export function LiveRewards({ url, theme }: { url: string; theme: ThemeContract }) {
  const layout = useLayout(url)
  return layout === undefined ? <p>Loading…</p> : <HotlayoutScreen document={layout} theme={theme} />
}
// #endregion
