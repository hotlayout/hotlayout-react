/**
 * Docs example ("Quickstart for React", step 3): the published document with honest states —
 * loading, drawn, not refreshed, failed — a bundled copy to start from and a retry. A test renders it.
 */
// #region live-document
import { useEffect, useState } from 'react'
import { HotlayoutScreen, checkDocumentVersion, loadDocument } from '@hotlayout/react'
import type { ThemeContract, UiDocument } from '@hotlayout/react'

export interface LiveLayout {
  /** What to draw: the last good read, else the copy bundled with the app, else nothing. */
  readonly layout: UiDocument | undefined
  /**
   * `loading` — the first read has not ended; `fresh` — `layout` is what is published now;
   * `stale` — the last read failed and `layout` is an earlier or bundled copy; `failed` — it failed and there is nothing to draw.
   */
  readonly status: 'loading' | 'fresh' | 'stale' | 'failed'
  readonly error: unknown
  readonly retry: () => void
}

/** The published layout, re-read whenever the user comes back to the tab. `bundled` is an optional copy shipped with the app. */
export function useLayout(url: string, bundled?: UiDocument): LiveLayout {
  const [layout, setLayout] = useState(bundled)
  const [read, setRead] = useState<{ ok: true } | { ok: false; error: unknown }>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      loadDocument(url, { bypassCache: true, signal: controller.signal })
        .then((next) => {
          // A layout this build cannot read does not replace the one on screen.
          const verdict = checkDocumentVersion(next.schemaVersion)
          if (verdict.kind === 'incompatible') throw new Error(`layout ${next.schemaVersion}: ${verdict.reason}`)
          setLayout(next)
          setRead({ ok: true })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          // Offline, a 404, an answer that is not JSON, another major: keep what is on screen — and say so.
          console.warn('layout not refreshed', error)
          setRead({ ok: false, error })
        })
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
  }, [url, attempt])

  const status = read === undefined ? 'loading' : read.ok ? 'fresh' : layout === undefined ? 'failed' : 'stale'
  const retry = () => {
    setRead(undefined)
    setAttempt((count) => count + 1)
  }
  return { layout, status, error: read?.ok === false ? read.error : undefined, retry }
}

export function LiveRewards({ url, theme, bundled }: { url: string; theme: ThemeContract; bundled?: UiDocument }) {
  const { layout, status, retry } = useLayout(url, bundled)
  if (layout !== undefined) return <HotlayoutScreen document={layout} theme={theme} style={{ minBlockSize: '100dvh' }} />
  if (status === 'failed') {
    return (
      <div role="alert">
        <p>We could not load this screen.</p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </div>
    )
  }
  return <p role="status">Loading…</p>
}
// #endregion

// #region own-backend
export function RewardsPage({ theme }: { theme: ThemeContract }) {
  // Same origin as the page: your backend serves the copy the webhook delivered. No CORS is involved.
  return <LiveRewards url="/api/ui/documents/reward-catalog" theme={theme} />
}
// #endregion
