/** README examples: placements — named places of the app that show what the admin put there. */
import { HotlayoutPlacement, usePlacement } from '@hotlayout/react'
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
