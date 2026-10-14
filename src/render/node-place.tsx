/** The place of a node for its text fields: the translation key of a field starts from the node id. */
import { useContext } from 'react'
import type { ReactNode } from 'react'

import { PlaceContext } from './contexts'
import { screenPart } from './screen-part'

export const NodePlace = screenPart(function NodePlace({ nodeId, children }: { nodeId: string; children: ReactNode }): ReactNode {
  const outer = useContext(PlaceContext)
  return <PlaceContext.Provider value={{ ...outer, nodeId }}>{children}</PlaceContext.Provider>
})
