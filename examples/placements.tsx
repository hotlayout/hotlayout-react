/** README examples: placements — named places of the app that show what the admin put there. */
import { HotlayoutPlacement, nextPlacementBoundary, readPlacementMapText, resolvePlacementAt, usePlacement } from '@hotlayout/react'
import type { PlacementStatusEvent } from '@hotlayout/react'
import { useState } from 'react'

// #region placement
const PROJECT = 'https://firebasestorage.googleapis.com/v0/b/my-bucket/o/orgs%2Facme%2Fprojects%2Fshop%2F'

const placements = {
  mapUrl: `${PROJECT}placements%2Fpublished.json?alt=media`,
  documentUrl: (documentId: string) => `${PROJECT}documents%2F${documentId}%2Fpublished.json?alt=media`,
}

export function HomeBanner() {
  const [shown, setShown] = useState(true)
  const onPlacementStatus = (event: PlacementStatusEvent) => {
    // Collapse the frame while the placement draws nothing (empty, unknown, document gone…),
    // and open it again when a document stands there. The placement stays mounted to hear it.
    setShown(event.status === 'document')
  }
  return (
    <section className="banner-frame" hidden={!shown}>
      <HotlayoutPlacement name="home.banner" {...placements} onPlacementStatus={onPlacementStatus} locale="en" />
    </section>
  )
}
// #endregion

// #region hook
export function PromoButton() {
  const placement = usePlacement('promo.raffle-button', { ...placements, lastKnown: false })
  if (placement.status !== 'document') return null
  // `placement.document` and `placement.entry` go to <HotlayoutScreen> as they are.
  return <p>{placement.document.documentId} starts at {placement.entry ?? 'its first screen'}</p>
}
// #endregion

// #region schedule
// A place may carry a schedule in the map: documents that stand there for a window of time
// (`from` included, `until` excluded, UTC instants such as `2026-11-27T22:00:00Z`).
// <HotlayoutPlacement> and usePlacement read the device clock themselves and switch on time,
// without the network. To decide on your own, ask the same rule:
export function whatStandsThere(mapText: string, name: string) {
  const map = readPlacementMapText(mapText)
  const now = Date.now()
  return {
    now: resolvePlacementAt(map, name, now), // { status, documentId, entry }; a pause is `empty`
    changesAt: nextPlacementBoundary(map, name, now), // milliseconds since the epoch, or null
  }
}

// In a test, give the placement your own clock (milliseconds since the epoch):
export function BlackFridayBanner() {
  return <HotlayoutPlacement name="home.banner" {...placements} clock={() => Date.parse('2026-11-28T10:00:00Z')} />
}
// #endregion
