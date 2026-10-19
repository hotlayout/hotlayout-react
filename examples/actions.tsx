/** README examples: actions, navigation, passing a record to a details screen. */
import { HotlayoutScreen, openInNewTab, runStandardAction } from '@hotlayout/react'
import type { ActionSource, DataScope, HapticWord, HotlayoutAction, UiDocument } from '@hotlayout/react'

declare function redeem(offerId: string | undefined): Promise<void>
declare const router: { push: (path: string) => void }
declare const analytics: { track: (name: string, params?: Record<string, string>) => void }

// #region actions
const ROUTES: Readonly<Record<string, string>> = { checkout: '/app/checkout', support: '/app/support' }

function handleAction(action: HotlayoutAction, source: ActionSource): void {
  // `openUrl`, `deeplink` and `close` arrive checked, and YOU perform them: the renderer opens nothing by itself.
  // The helper runs only what passed the contract's check; an app link only with a scheme you named.
  const done = runStandardAction(action, {
    openUrl: openInNewTab, // or your own: a router, an in-app browser
    deeplinkSchemes: ['myapp'], // without this list a `deeplink` is never performed
    openDeeplink: (url) => {
      router.push(url)
    },
    close: () => {
      router.push('/app')
    },
  })
  if (done) return
  if (action.invalid !== undefined) {
    // `action.params.url` of an invalid action is a raw string from the document: never open it.
    // A catalog action whose parameter failed the check (a bound address that is not `https:`): never run it.
    console.warn('layout action refused', action.type, action.invalid.param, action.invalid.problem)
    return
  }
  switch (action.type) {
    case 'submit': {
      // Which record: the list row the button is in, or the row that opened this screen.
      const offerId = source.record?.['offer.id']
      void redeem(typeof offerId === 'string' ? offerId : action.params?.offerId)
      break
    }
    case 'share':
      void navigator.share({ url: location.href })
      break
    case 'navigate': {
      // A screen this document does not have: it is yours. Match the name against YOUR routes —
      // never build a path from `action.params.screenId`, it is text from a document.
      const route = ROUTES[action.params?.screenId ?? '']
      if (route !== undefined) router.push(route)
      break
    }
    case 'navigate.back': // "back" on the first screen: the user leaves the flow
      router.push('/app')
      break
    default:
      console.warn('unhandled layout action', action.type, 'from', source.nodeId)
  }
}
// #endregion

export function WithActions({ layout }: { layout: UiDocument }) {
  return <HotlayoutScreen document={layout} onAction={handleAction} />
}

// #region analytics
export function Tracked({ layout }: { layout: UiDocument }) {
  return (
    <HotlayoutScreen
      document={layout}
      onAction={handleAction}
      // A button with `action.track`: once per press, BEFORE the action itself (and for `none` too).
      onTrack={(event, source) => {
        analytics.track(event.event, { ...event.params, node: source.nodeId, screen: source.screenId })
      }}
      // One call per screen shown: the first one, a forward step, a return. Not on re-renders, not on the server.
      onScreenChange={(screen) => {
        analytics.track('screen_view', { screen: screen.screenId, cause: screen.cause, depth: String(screen.depth), entry: screen.entry ?? '' })
      }}
    />
  )
}
// #endregion

// #region navigation
export function RoutedRewards({ layout, entry }: { layout: UiDocument; entry: string }) {
  return (
    <HotlayoutScreen
      document={layout}
      entry={entry} // an entry-point name from your route, e.g. /rewards/[entry]
      onNavigate={(event) => {
        if (event.kind !== 'push') return undefined // let the renderer go back by itself
        const name = Object.entries(layout.entryPoints ?? {}).find(([, screenId]) => screenId === event.to.screenId)?.[0]
        if (name === undefined) return undefined // a screen without a public name: the renderer shows it
        router.push(`/rewards/${name}`) // your router owns the URL…
        return false // …so the renderer stays put, and the new `entry` opens the screen
      }}
      onScreenChange={(screen) => {
        console.log('shown', screen.screenId, screen.presentation)
      }}
    />
  )
}
// #endregion

// #region screen-data
export function Catalog({ layout, shared, items, onRedeem }: { layout: UiDocument; shared: DataScope; items: readonly DataScope[]; onRedeem: (itemId: string) => void }) {
  return (
    <HotlayoutScreen
      document={layout}
      data={shared} // what every screen reads: { 'user.points': 1250, … }
      collections={{ items }} // the list: [{ id: '42', name: 'Coffee set' }, …]
      onAction={(action, source) => {
        // `source.record` is the record the action is about, as a flat map of paths.
        // Pressed in a list row: that row. Pressed on a screen opened from a row: that row too.
        const itemId = source.record?.['item.id']
        if (action.type === 'submit' && typeof itemId === 'string') onRedeem(itemId)
      }}
    />
  )
}
// #endregion

// #region busy-swipe
// The thumb of a drag-to-confirm button waits here: it stays busy until the promise settles.
async function redeemAndWait(action: HotlayoutAction, source: ActionSource): Promise<void> {
  const offerId = source.record?.['offer.id']
  await redeem(typeof offerId === 'string' ? offerId : action.params?.offerId)
}
// #endregion

export function WithBusySwipe({ layout }: { layout: UiDocument }) {
  return <HotlayoutScreen document={layout} onAction={redeemAndWait} />
}

// #region haptic
// One call per press that asks for it, before `onTrack` and the action. The renderer vibrates nothing itself.
const PATTERNS: Readonly<Record<HapticWord, number | number[]>> = {
  light: 8,
  medium: 16,
  heavy: 28,
  selection: 6,
  success: [10, 40, 10],
  warning: [24, 60, 24],
}

export function WithHaptics({ layout }: { layout: UiDocument }) {
  return (
    <HotlayoutScreen
      document={layout}
      onAction={handleAction}
      onHaptic={(kind) => {
        // Not every browser can: `vibrate` is absent on iOS Safari, and the user may have turned vibration off.
        if ('vibrate' in navigator) navigator.vibrate(PATTERNS[kind])
      }}
    />
  )
}
// #endregion
