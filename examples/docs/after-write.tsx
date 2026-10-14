/** Docs example ("Quickstart for React", step 6): after a write the host supplies the data that depends on it. A test renders it. */
// #region after-write
import { useState } from 'react'
import { HotlayoutScreen } from '@hotlayout/react'
import type { DataScope, UiDocument } from '@hotlayout/react'

/** `catalog` maps a product id to its fields in the flat form of the data dictionary: `{ 'item.name': 'Bottle', 'item.price': 300 }`. */
export function Shop({ layout, catalog }: { layout: UiDocument; catalog: Readonly<Record<string, DataScope>> }) {
  const [selectedId, setSelectedId] = useState('')
  return (
    <HotlayoutScreen
      document={layout}
      // The renderer wrote the id. The host supplies the record the id stands for.
      data={{ ...catalog[selectedId], 'item.selectedId': selectedId }}
      writablePaths={['item.selectedId']}
      onWrite={(path, value) => {
        if (path === 'item.selectedId' && typeof value === 'string') setSelectedId(value)
      }}
    />
  )
}
// #endregion
