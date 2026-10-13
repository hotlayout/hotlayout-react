/** README example: the shortest integration. The sections between `#region` and `#endregion` appear verbatim in the README. */
// #region quick-start
import { HotlayoutScreen } from '@hotlayout/react'
import type { ThemeContract, UiDocument } from '@hotlayout/react'

export function Rewards({ layout, theme }: { layout: UiDocument; theme: ThemeContract }) {
  return (
    <HotlayoutScreen
      document={layout} // the layout document, parsed JSON
      theme={theme} // the project theme, parsed JSON; omit it to use the built-in one
      data={{ 'user.firstName': 'Ada', 'user.points': 1250 }}
      collections={{ items: [{ name: 'Coffee', price: 300 }] }}
      locale="en"
      style={{ minBlockSize: '100dvh' }}
      onAction={(action, source) => {
        console.log('the user asked for', action.type, action.params, 'on', source.nodeId)
      }}
    />
  )
}
// #endregion
