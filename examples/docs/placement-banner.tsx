/** Docs examples: a banner on the home screen that shows the document the admin put into the place `home.banner`. */
import { HotlayoutPlacement, runStandardAction } from '@hotlayout/react'
import type { ActionSource, HotlayoutAction, PlacementStatusEvent, ThemeContract } from '@hotlayout/react'
import { useState } from 'react'

declare const theme: ThemeContract
declare const router: { push: (path: string) => void }

// #region placement-banner
// Your backend serves the project folder with the same layout as our storage:
//   <BASE>/placements/published.json
//   <BASE>/documents/<documentId>/published.json
const BASE = 'https://api.example.com/hotlayout'

function onBannerAction(action: HotlayoutAction, source: ActionSource): void {
  // The banner is one small document; what a press does is YOUR decision, as on any screen.
  // `deeplink` and `openUrl` arrive checked; the helper runs only what you allow.
  const done = runStandardAction(action, {
    deeplinkSchemes: ['myapp'],
    openDeeplink: (url) => {
      router.push(url)
    },
  })
  if (!done) console.warn('banner action not handled', action.type, 'from', source.nodeId)
}

export function HomeBanner() {
  // Fold the frame while nothing stands in the place, so the home screen has no hole.
  const [shown, setShown] = useState(false)
  const onPlacementStatus = (event: PlacementStatusEvent) => setShown(event.status === 'document')
  return (
    <section hidden={!shown} style={{ maxHeight: 160, overflow: 'hidden' }}>
      <HotlayoutPlacement
        name="home.banner"
        mapUrl={`${BASE}/placements/published.json`}
        documentUrl={(documentId) => `${BASE}/documents/${documentId}/published.json`}
        theme={theme}
        onAction={onBannerAction}
        onPlacementStatus={onPlacementStatus}
      />
    </section>
  )
}
// #endregion
