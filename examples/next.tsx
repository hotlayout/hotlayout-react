/** README examples: Next.js (App Router), a server component and a client component with handlers. Verified in an application outside this repository. */
import { HotlayoutScreen, checkDocumentVersion, loadDocument, loadTheme } from '@hotlayout/react'
import type { ThemeContract, UiDocument } from '@hotlayout/react'

declare const DOCUMENT_URL: string
declare const THEME_URL: string
declare function redeem(offerId: string | undefined): Promise<void>

// #region next-server
// app/rewards/page.tsx — a Server Component. No "use client", no wrapper of your own.
export default async function RewardsPage() {
  const [layout, theme] = await Promise.all([loadDocument(DOCUMENT_URL), loadTheme(THEME_URL).catch(() => undefined)])
  if (checkDocumentVersion(layout.schemaVersion).kind === 'incompatible') return <p>This screen needs a newer app.</p>
  // `now` is read once on the server and travels to the browser with the props: both count "days left" from the same moment.
  const now = new Date().getTime()
  return <HotlayoutScreen document={layout} theme={theme} locale="ar" timeZone="Asia/Dubai" now={now} style={{ minBlockSize: '100dvh' }} />
}
// #endregion

// #region next-client
// app/rewards/Rewards.tsx — starts with 'use client': callbacks are functions,
// and functions cannot be passed from a Server Component to a Client Component.
export function Rewards({ layout, theme }: { layout: UiDocument; theme: ThemeContract | undefined }) {
  return (
    <HotlayoutScreen
      document={layout}
      theme={theme}
      timeZone="Asia/Dubai"
      onAction={(action) => {
        if (action.type === 'submit') void redeem(action.params?.offerId)
      }}
    />
  )
}
// #endregion
