/**
 * The top zone of a screen (schema 9.24.0): children of the root pinned to the TOP with `pin: 'top'`.
 *
 * The rules are contract data (`x-style.layout.topZone`); the functions are the reference
 * implementation's, written out here because the package does not import from the contract
 * repository. The two copies are kept together by the shared case table
 * `contract/fixtures/top-zone/top-zone-cases.json` and by a test that compares the data block with
 * the artifact.
 *
 * Who is in the zone: the children of the root in a RUN at the start, right after the app bar zone
 * (or first when there is none), whose `pin` is `top`. The first child without the word ends the
 * run, and the word is not read after it. The document counts, not visibility. The app bar and the
 * navigation bar are never pinned (they are zones already), and with `bodyTop: 'screenTop'` on the
 * root there is no such zone. An older reader treats `top` as "no field" and the nodes scroll with
 * the body.
 *
 * No React and no DOM in this file: the server graph of the entry point reads it too.
 */

/** The word of the field `pin` that pins a node to the top. */
export const TOP_PIN = 'top'

interface RootChild {
  readonly type: string
  readonly pin?: unknown
}

/** Whether the node carries the word `top`: an own property, the prototype chain gives no word. */
export function topPinOf(node: object | undefined | null): boolean {
  if (node === undefined || node === null || !Object.hasOwn(node, 'pin')) return false
  return (node as { readonly pin?: unknown }).pin === TOP_PIN
}

/** Whether the root says "the body from the top of the screen": then there is no top zone of nodes. */
function bodyAtScreenTopWord(rootProps: unknown): boolean {
  return typeof rootProps === 'object' && rootProps !== null && Object.hasOwn(rootProps, 'bodyTop') && (rootProps as { readonly bodyTop?: unknown }).bodyTop === 'screenTop'
}

/** Which children of the root are pinned to the top: the run from the start (after the app bar) with `pin: 'top'`. */
export function screenTopPinnedOf<T extends RootChild>(children: readonly T[], rootProps?: unknown): readonly T[] {
  if (bodyAtScreenTopWord(rootProps)) return []
  const from = children[0]?.type === 'AppBar' ? 1 : 0
  const pinned: T[] = []
  for (const child of children.slice(from)) {
    if (!topPinOf(child) || child.type === 'AppBar' || child.type === 'NavBar') break
    pinned.push(child)
  }
  return pinned
}

/** `x-style.layout.topZone` of the artifact, whole; a test compares the two. */
export const TOP_ZONE_RULES = {
  field: 'pin',
  word: TOP_PIN,
  refines: ['x-style.layout.screen.appBar', 'x-style.layout.screen.body.area', 'x-style.layout.bottomZone.pinned.elsewhere'],
  is: 'children-of-the-screen-root-in-a-run-at-the-start-right-after-the-app-bar-zone-or-first-whose-pin-is-top',
  counts: 'document-order-not-visibility',
  run: 'the-first-child-without-the-word-ends-the-run-the-word-is-not-read-after-it',
  atMost: 'no-limit',
  hidden: 'no-room',
  never: ['AppBar', 'NavBar'],
  withBodyAtScreenTop: 'not-read-the-nodes-are-children-of-the-body',
  order: ['safeInset', 'appBar', 'pinned'],
  position: 'top-of-the-screen-fixed',
  scrolls: 'never',
  place: {
    withAppBar: 'below-the-app-bar-the-screen-gap-between',
    withoutAppBar: 'first-node-below-the-safe-inset-and-the-root-top-padding',
    between: 'screen-gap',
    pullOfTheFirst: 'not-read',
    pullOfTheOthers: 'as-in-the-screen-column',
    width: 'as-a-child-of-the-screen-column-root-side-padding',
    contentMaxWidth: 'the-same-column-as-the-body',
  },
  safeInset: {
    withAppBar: 'inside-the-app-bar-box-as-before',
    withoutAppBar: 'reader-adds-the-platform-inset-above-the-zone-outside-the-node-boxes',
  },
  background: 'none-unless-the-node-names-one-the-screen-background-shows-through',
  body: {
    area: 'from-the-bottom-edge-of-the-top-zone-to-the-top-edge-of-the-bottom-zone',
    lead: 'screen-gap-inside-the-scroll',
    rootTopPadding: 'goes-to-the-top-zone',
    clip: 'bottom-edge-of-the-top-zone',
    pulledFirstChild: 'lifts-the-body-area-onto-the-top-zone-as-onto-the-app-bar',
  },
  firstScreen: 'nodes-of-the-zone-are-never-below-the-fold',
  inModalLayer: 'drawn-at-the-top-of-the-layer-below-its-app-bar',
  wide: {
    ownNavBar: 'below-the-own-bar-of-the-navigation',
    sameInEveryWidthClass: true,
  },
  appBarScrolled: 'the-threshold-reads-the-scroll-of-the-body-as-before',
  withoutOwnHeight: 'sticks-together-with-the-app-bar-zone-by-the-same-host-switch',
  press: 'nodes-of-the-zone-take-their-own-presses',
  olderReader: 'reads-the-word-as-no-field-the-nodes-scroll-with-the-body',
  cases: 'contract/fixtures/top-zone/top-zone-cases.json',
} as const

export interface TopZoneInput {
  /** The height of the app bar zone box (its safe inset inside); `undefined` when there is no app bar or it is hidden. */
  readonly appBarHeight?: number | undefined
  /** The heights of the SHOWN pinned nodes in document order; `pull` is the overlap with the previous one (the first one's is not read). */
  readonly pinned: readonly { readonly height: number; readonly pull?: number | undefined }[]
  readonly rootPaddingTop: number
  readonly gap: number
  /** The top safe inset the reader adds; with an app bar it is already in its height. */
  readonly safeTop?: number | undefined
}

export interface TopZoneBox {
  readonly height: number
  readonly appBar: { readonly top: number; readonly height: number } | null
  readonly pinned: readonly { readonly top: number; readonly height: number }[]
  readonly bodyTop: number
}

/** The box of the top zone: the app bar at the root top padding, the first node a gap below it (or at the root top padding without a bar), the others a gap (minus `pull`) apart. */
export function topZoneOf(input: TopZoneInput): TopZoneBox {
  const gap = Math.max(0, input.gap)
  const padding = Math.max(0, input.rootPaddingTop)
  const hasBar = input.appBarHeight !== undefined
  const barHeight = Math.max(0, input.appBarHeight ?? 0)
  const safe = hasBar ? 0 : Math.max(0, input.safeTop ?? 0)
  const appBar = hasBar ? { top: padding, height: barHeight } : null
  let cursor = hasBar ? padding + barHeight : safe
  const pinned = input.pinned.map((entry, index) => {
    const lead = index === 0 ? (hasBar ? gap : padding) : gap - Math.max(0, entry.pull ?? 0)
    const top = cursor + lead
    const height = Math.max(0, entry.height)
    cursor = top + height
    return { top, height }
  })
  return { height: cursor, appBar, pinned, bodyTop: cursor }
}
