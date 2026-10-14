/**
 * Docs example ("Quickstart for React", step 8): a Next.js 16 page (App Router) that draws the
 * published document. Verified in a fresh `create-next-app`, in `next dev` and in `next build` +
 * `next start`, with `cacheComponents` on (the default of a new app) and off.
 */
// #region next-page
// app/rewards/page.tsx — a Server Component. No "use client", no wrapper of your own.
import { Suspense } from 'react'
import { connection } from 'next/server'
import { HotlayoutScreen, checkDocumentVersion, loadDocument, loadTheme } from '@hotlayout/react'

import { DOCUMENT_URL, THEME_URL } from './addresses' // the direct addresses, or addresses of your backend

export default function RewardsPage() {
  // The page shell is static. The screen is rendered per request and streams in; until then the user sees the fallback.
  return (
    <Suspense fallback={<p role="status">Loading rewards…</p>}>
      <PublishedRewards />
    </Suspense>
  )
}

async function PublishedRewards() {
  // Per request, never at build time: what a manager published is on the page at the next load.
  await connection()
  const [layout, theme] = await Promise.all([loadDocument(DOCUMENT_URL), loadTheme(THEME_URL).catch(() => undefined)])
  if (checkDocumentVersion(layout.schemaVersion).kind === 'incompatible') return <p role="alert">This screen needs a newer app.</p>
  // `now` is read once on the server and travels to the browser with the props: both count "days left" from the same moment.
  const now = new Date().getTime()
  return <HotlayoutScreen document={layout} theme={theme} locale="en" timeZone="Europe/Kyiv" now={now} style={{ minBlockSize: '100dvh' }} />
}
// #endregion
