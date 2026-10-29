# @hotlayout/react

React renderer for [HotLayout](https://hotlayout.com) — server-driven UI (SDUI).
A screen is assembled in a visual builder and published as JSON; your app draws
it with one component, and the next publish changes the screen without a
release.

**Quickstart:** [docs](https://hotlayout.com/docs/integrator/quickstart-react) · [video](https://youtu.be/YVLhz5-z_bs) · **Builder and access:** [hotlayout.com](https://hotlayout.com)

```sh
npm install @hotlayout/react
```

React 18.2+ or 19 · ESM with types · no other dependencies · Apache-2.0

## Quick start

<!-- example: quick-start.tsx#quick-start -->
```tsx
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
```

That is the whole integration: give the component a document, a theme and
data, and tell it what your app does with actions.

## What you get

- **One component.** `<HotlayoutScreen>` draws the document, keeps the screen
  stack, tabs, forms and modal sheets, and hands your app the actions.
- **Server rendering.** No `window` on import, no network, no globals; works in
  a Next.js App Router Server Component without a wrapper.
- **Right-to-left scripts.** Direction follows the language that is shown;
  layout, icons and arrow keys mirror.
- **Accessibility built in.** Real buttons and inputs, focus management,
  WAI-ARIA tabs and dialogs.
- **Untrusted input.** The document and the theme are parsed again where they
  become CSS, an address or a key — see [Security model](#security-model).
- **Nothing but React.** No runtime dependencies besides `react` and
  `react-dom`; styles are scoped to the component's own root.
- **One document, two platforms.** The same JSON is drawn in a mobile app by
  the Flutter package
  [`hotlayout_flutter`](https://pub.dev/packages/hotlayout_flutter).

The builder and the product: [hotlayout.com](https://hotlayout.com).

## Contents

- [Getting the document, the theme and the data](#getting-the-document-the-theme-and-the-data)
- [What the renderer does on its own](#what-the-renderer-does-on-its-own)
- [API](#api) — props, reports, other exports
- [Actions and navigation](#actions-and-navigation) — analytics, the
  screen-shown event, your router, pressable cards
- [Screen layout](#screen-layout) — scrolling, the app bar, the bottom zone,
  safe areas, adaptive layout by width
- [Data](#data) — templates, numbers, money and plurals; list records; writes
- [Forms](#forms)
- [Theme](#theme) · [Fonts](#fonts) · [Languages and right-to-left](#languages-and-right-to-left)
- [Server rendering and Next.js](#server-rendering-and-nextjs)
- [Styles and isolation](#styles-and-isolation)
- [Security model](#security-model)
- [Accessibility](#accessibility)
- [Versions](#versions) — what each schema minor added
- [Placements](#placements) — named places that show what the admin chose
- [Updating a screen without a release](#updating-a-screen-without-a-release)
- [Limitations](#limitations)
- [Learn more](#learn-more)

## Getting the document, the theme and the data

Where the two JSON files come from is up to you — bundle them, fetch them on
the server, or [load them by URL](#updating-a-screen-without-a-release) so that
a republished screen reaches users without a deploy.

**`document`** — the published layout of one document. It is a static JSON
file, readable without a token:

```text
https://firebasestorage.googleapis.com/v0/b/<bucket>/o/orgs%2F<orgId>%2Fprojects%2F<projectId>%2Fdocuments%2F<documentId>%2Fpublished.json?alt=media
```

- The object path is
  `orgs/{orgId}/projects/{projectId}/documents/{documentId}/published.json`,
  URL-encoded.
- The project settings in the HotLayout admin (*Delivery*) show this address as
  a template with your bucket and ids filled in.
- If the project delivers by **webhook**, your backend receives the same JSON
  on every publish and serves it from wherever you like.

**`theme`** — the published theme of the project, one file for all its
documents, at the same place:
`…/o/orgs%2F<orgId>%2Fprojects%2F<projectId>%2Ftheme%2Fpublished.json?alt=media`.

**Keys of `data` and `collections`** — the project's **data dictionary**: the
*Data dictionary* section of the project in the admin, where it can be
downloaded as `data-contract.json` (the webhook body carries the same list as
`dataContract`).

| In the dictionary | In your props |
|---|---|
| `paths` | the keys of `data` (`user.firstName`) |
| `collections[].path` | the keys of `collections` (`items`) |
| `collections[].item` | the prefix of the record fields inside a list (`item.name` → the `name` field of a record) |

Two notes on the example:

- The examples call the variable `layout`, not `document`: inside a component
  `document` would shadow the browser's own `document`.
- Give the root a height (`style={{ minBlockSize: '100dvh' }}`). The root is a
  flex column that takes the size you give it, the screen background reaches
  its bottom, and modal sheets sit on the bottom edge of its area (with
  `scroll="page"` — of the part of the root that is visible in the window, see
  [Scrolling and the app bar](#scrolling-and-the-app-bar)).

## What the renderer does on its own

| | |
|---|---|
| **Screens** | Keeps the screen stack. `navigate` (to a screen of the same document) and `navigate.back` work out of the box, including the `AppBar` back arrow. |
| **Modal screens** | `presentation: 'modal'` is drawn as a bottom sheet over the previous screen, with dialog semantics: focus moves in, `Esc` or a tap on the scrim goes back. |
| **Local state** | Tabs, accordions and choice groups switch without the host. The document only says the initial state. |
| **Compatibility** | Applies the contract's compatibility policy: an unknown widget draws its children, an unknown token is skipped or replaced by the field default, a document of another schema **major** is refused loudly. |
| **Theme fallbacks** | An unreadable theme never blanks the screen: the built-in theme is used and you are told through `onReport`. |
| **Images** | An asset token without a URL, and a URL that failed to load, are drawn as a neutral placeholder — never as the browser's broken-image icon. |
| **Direction** | Sets `dir` on its own root from the language the document is shown in (CLDR via `Intl.Locale`) and mirrors directional icons. |
| **Fade on a condition** | A node with `visibilityTransition: "fade"` and a `visibleIf` does not blink when the condition changes: the leaving node fades out in place (120 ms) and then leaves the layout, the appearing one waits the same time out of the layout and fades in (160 ms). No pairing: every node has its own timeline. A leaving node is `inert` and out of the accessibility tree at once. The first draw, going back, a change of the language or of the width class, "reduce motion" and the server render are not transitions. |
| **Motion** | A node with `motion` drifts (`float`) or breathes (`pulse`) forever; it only paints, so neighbours never move. The position follows the contract's sine formula, computed by the browser from one animated angle. The system "reduce motion" setting and the server render leave the node at rest. |
| **Blur and glass** | A modal screen with `backdropBlur` blurs everything under the layer (the dimming lies over the blur); a node with `style.backdropBlur` blurs what is painted under its box, within its radius. Both are `backdrop-filter`. |
| **Touch targets** | Buttons look exactly as designed (a button with `sm` padding is 40 px tall) but are *pressable* in an area of at least 48 × 48 px, without shifting neighbours. |

The contract between the builder and the readers (`screen-schema.json`,
`theme.json`) is the single source of truth, so the renderer never invents
anything: spacing, colours and typography come from the theme, layout rules
come from the contract.

## API

### `<HotlayoutScreen>`

| Prop | Type | |
|---|---|---|
| **What to draw** | | |
| `document` | `UiDocument` | **Required.** The layout document. Not validated against the schema — the builder did that — but never trusted either. |
| `theme` | `ThemeContract` | `{ themeContractVersion, defaultThemeId, themes }` — a project's `theme/published.json`. Omit to use the built-in starter theme. See [Theme](#theme). |
| `themeId` | `string` | Which theme of the set to use, e.g. `'dark'`. Unknown id → the set's default. |
| `entry` | `string` | Public entry-point name. Unknown name → the initial screen. Changing `entry` restarts the stack. |
| `assets` | `Record<string, string>` | URLs for asset tokens (`logo`, `banner`, …). A token without a URL is drawn as a placeholder. |
| **Data** | | |
| `data` | `Record<string, unknown>` | Values for bindings, as a **flat** map keyed by data-contract path: `{ 'user.points': 1250 }`. See [Data](#data). |
| `collections` | `Record<string, object[]>` | Lists for `Repeater` widgets, keyed by collection name. |
| `onWrite` | `(path, value: string \| boolean \| number) => void` | The user changed a data-bound input, or pressed a write action. **The path is named by the document** — see [Writes](#writes-the-document-names-the-path) and [Forms](#forms). |
| `writablePaths` | `string[] \| (path) => boolean` | The data paths the document may write to. With it, `onWrite` is called for these paths only; without it, for any path of the dictionary form. |
| `autofill` | `boolean` | Whether text fields may ask the browser for autofill hints. Default `true`; `false` sets `autocomplete="off"` on every field. See [Forms](#forms). |
| **Language and time** | | |
| `locale` | `string` | The user's locale as the platform gives it (`ar-EG`, `pt_BR`). The renderer finds the document's translation itself — see [Languages](#languages-and-right-to-left). |
| `dir` | `'ltr' \| 'rtl'` | Overrides the direction derived from `locale`. |
| `timeZone` | `string` | IANA zone the bound dates are written in. Defaults to the zone of whoever renders. **Set it when you render on a server** — see [Server rendering](#server-rendering-and-nextjs). |
| `now` | `number \| Date` | The moment the screen is rendered at (epoch milliseconds or a `Date`); `daysUntil` and `countdownPart` count from it. Defaults to the clock of whoever renders, read on every render; a screen that shows a countdown part then ticks, and with your `now` it does not (you own the clock). **Set it when you render on a server**, and in tests and previews — see [Sentences, numbers, money and plurals](#sentences-numbers-money-and-plurals). |
| `labels` | `{ back?: string }` | Texts that belong to the renderer: the accessible name of the back arrow. Translate it with your UI. |
| **Events** | | |
| `onAction` | `(action, source) => unknown` | Actions the renderer does not perform itself — see [Actions and navigation](#actions-and-navigation). `source` is `{ nodeId, screenId, record? }`. A returned promise keeps a drag-to-confirm button busy until it settles. |
| `onTrack` | `(event, source) => void` | The analytics event of a press, once per press and **before** the action — see [Analytics](#analytics-what-was-pressed-what-was-shown). |
| `onHaptic` | `(kind, source) => void` | A request for a tactile response, once per press and **before** `onTrack` and the action — see [Haptic feedback](#haptic-feedback). The renderer never vibrates by itself. |
| `onNavigate` | `(event) => boolean \| undefined` | Called **before** the renderer changes screens. Return `false` to cancel and navigate yourself — see [Driving navigation with your router](#driving-navigation-with-your-router). |
| `onScreenChange` | `(screen) => void` | The screen-shown event: once per show of a screen, the first one included — see [Screen shown](#screen-shown). |
| `onReport` | `(report) => void` | What the renderer refused, ignored or replaced — see [Reports](#reports) for the list, and for what is *not* reported. Without a handler the reports go to `console.warn`. |
| **Trust and failures** | | |
| `resolveImageUrl` | `(url, context) => string \| null` | Your decision about every image address named by the document or by bound data. Default: absolute `https:` only. See [Images](#images-https-only-unless-you-say-otherwise). |
| `renderIncompatible` | `(verdict, version) => ReactNode` | What to show instead of a document of an incompatible major. Default: a short `role="alert"` message. See [Versions](#versions). |
| `renderError` | `({ screenId, message }) => ReactNode` | What to show instead of a screen that threw while rendering. Default: *"This screen is not available right now."* The error never reaches your application — see [Security model](#security-model). |
| **Placement on your page** | | |
| `className`, `style` | | Applied to the root element. Use them to size and place the screen. |
| `injectStyles` | `boolean` | Render the package stylesheet next to the screen. Default `true`. See [Strict Content-Security-Policy](#strict-content-security-policy). |
| `scroll` | `'page' \| 'screen'` | Who scrolls: your page (default) or the block you gave a height to. See [Scrolling and the app bar](#scrolling-and-the-app-bar). |
| `chrome` | `'sticky' \| 'static'` | Only with `scroll="page"`: whether the app bar and the bottom zone stick to the viewport (default) or scroll with the page. |
| `stickyOffset` | `number \| string` | Only with `scroll="page"` and `chrome="sticky"`: the `top` the app bar sticks at when your site has a fixed header above the block. |
| `stickyBottomOffset` | `number \| string` | The same for the bottom zone: the `bottom` it sticks at when your site has a fixed bar below the block. |
| `safeAreaTop` | `number \| 'env'` | The top safe-area inset. Default `'env'`. See [Safe areas](#safe-areas). |
| `trapFocus` | `boolean` | Keep `Tab` inside a modal layer at all times. Default `false`: only a dismissible layer cycles `Tab`, and `Tab` may leave a layer that waits for an action. |
| `safeAreaBottom` | `number \| 'env'` | The bottom safe-area inset: under the bottom zone, and inside a modal sheet. Default `'env'`. See [Safe areas](#safe-areas). |
| `initialWidthClass` | `'compact' \| 'medium' \| 'expanded'` | The width class to draw until the root element has been measured (default `'compact'`). See [Adaptive layout by width](#adaptive-layout-by-width). |

The stack is tied to `document.documentId` and `entry`, not to object identity:
re-parsing the same published file on every render does not throw the user
back to the first screen.

### Reports

`onReport` receives an object with a `kind`. Every one of them is something the
renderer already handled; the report is for your logs.

| `kind` | What happened |
|---|---|
| `incompatible-document` | The document was **not** drawn: its schema major differs from the reader's, or the version is not readable. Carries `documentVersion`, `readerVersion`, `reason`, `relation`. |
| `newer-minor-document` | The document comes from a newer minor: it is drawn, unknown widgets and tokens are skipped by policy. |
| `theme-fallback` | The theme could not be read; the built-in one is drawn. |
| `unknown-theme-id` | `themeId` is not in the set; the set's default is used. |
| `invalid-theme-values` | Some theme entries did not have the promised form and were ignored: core tokens fall back to the built-in theme of the same brightness, custom tokens become unknown. `paths` lists up to 20 of them. |
| `unknown-entry` | `entry` names an entry point the document does not have; the initial screen is shown. |
| `no-screen` | The document has no screen to start from. Nothing is drawn. |
| `ignored-input` | A part of the document, of the bound data or of a request to the host did not have the shape the contract promises and was ignored (`where`, `reason`). The rest of the screen is drawn. |
| `render-error` | A screen threw while rendering and was replaced by the neutral notice. Your application is not affected. |

**What is reported, and what is not.** A report means the renderer met
something that should not be there. A screen that simply has nothing to show
yet is not that, and stays silent:

| Reported | Not reported |
|---|---|
| A document, a theme, an `entry` or a `themeId` that could not be used as given (the rows above `ignored-input`). | A bound value that is missing, `null` or an empty string: the binding's `fallback` is drawn. |
| An image address the policy refused — `http:`, `data:`, `blob:`, a relative address, a script address, or `null` from `resolveImageUrl`: `ignored-input` with `where: 'image address “…”'`. | An image with no address at all (no value in the data, an empty address): the placeholder is drawn. |
| A part of the document or of the bound data that does not have the promised shape: `ignored-input`. | An asset token you gave no URL for in `assets`: the placeholder is drawn. |
| A write to a path outside `writablePaths`: `ignored-input`. | An image whose allowed address failed to load in the browser: the placeholder is drawn. |
| A screen that threw: `render-error`. | |

Reports are delivered in the browser (in an effect, once each), never during
server rendering.

### Other exports

| Export | |
|---|---|
| `checkDocumentVersion(version)` | The contract's version rule as a plain function — see [Versions](#versions). |
| `loadDocument(url, options?)`, `loadTheme(url, options?)` | Fetch a published file — see [Updating a screen without a release](#updating-a-screen-without-a-release). A file of the wrong kind (a theme where a document is expected, an HTML page, an unrelated object) is an error too. Errors are `HotlayoutLoadError` with `url` and `status`. |
| `runStandardAction(action, handlers)` | The optional helper that performs `openUrl`, `deeplink` and `close` — only those that passed the check, only with the handlers and app-link schemes you give it. Returns `true` when it did. See [Actions and navigation](#actions-and-navigation). |
| `openInNewTab(url)` | A ready `openUrl` handler: `window.open(url, '_blank', 'noopener,noreferrer')`. The renderer never calls it; you pass it to `runStandardAction`. |
| `paramFormProblem(form, value)`, `ACTION_CATALOG` | The contract's check of an action parameter and the catalog of named actions — plain data and a plain function, no React, usable on the server. |
| `HotlayoutPlacement`, `usePlacement(name, options)` | A named place of the app that shows the document the admin put there — see [Placements](#placements). |
| `readPlacementMapText(text)`, `readPlacementMapBytes(bytes)`, `resolvePlacement(map, name)`, `resolvePlacementAt(map, name, nowMs)`, `nextPlacementBoundary(map, name, nowMs)`, `pickPlacementMap(input)`, `placementShowing(resolution, document?)`, `placementEvent(previous, next)`, `loadPlacementMap(url, options?)` | The rules behind placements as plain functions — no React, usable on the server. |
| `resolveTheme(contract, themeId?)` | The theme the renderer would draw with, plus the fallbacks it took. |
| `resolveLocale(requested, available, source)` | Which language a document is shown in for a given user locale — the renderer's own rule, for the parts of your UI that must speak the same language as the screen. See [Languages](#languages-and-right-to-left). |
| `BUILT_IN_THEME_CONTRACT` | The built-in light and dark themes. |
| `HOTLAYOUT_CSS` | The stylesheet as a string (also shipped as `@hotlayout/react/styles.css`). |
| `READER_SCHEMA_VERSION`, `READER_THEME_VERSION` | What this build understands. |
| Types | `UiDocument`, `UiNode`, `ScreenEntry`, `ThemeContract`, `Theme`, `HotlayoutScreenProps`, `HotlayoutAction`, `StandardAction`, `InvalidActionParam`, `TrackEvent`, `ActionSource`, `NavigationEvent`, `ScreenInfo`, `ScreenShown`, `HotlayoutReport`, `VersionVerdict`, `DataScope`, `Collections`, `LoadOptions`, `LocaleResolution`, `ResolveImageUrl`, `ImageUrlContext`, … |

Anything not listed here is internal and may change in a minor release.

## Actions and navigation

A button, a list row or the back arrow carries an **action**:
`{ type: string, params?: Record<string, string> }`. The contract names nine
of them and says who performs each; any other `type` is yours.

| `type` | Performed by | Parameters |
|---|---|---|
| `none` | the renderer — does nothing, never reaches you | — |
| `navigate` | the renderer; to a screen the document does not have — you | `screenId` |
| `navigate.back` | the renderer; on the first screen — you | — |
| `navigate.section` | the renderer; to a screen the document does not have — you | `screenId` |
| `setValue`, `toggleValue` | the renderer — a write, never reaches `onAction`; see [Write actions and choice](#write-actions-and-choice) | `path`, a value |
| `openUrl` | **you** | `url` — an `https://` address |
| `deeplink` | **you** | `url` — an app link (`myapp://offers/42`) |
| `close` | **you** — the renderer does not touch the screen stack | — |

What reaches `onAction`:

- The `type` exactly as written in the document, and `params` as a plain map of
  strings. A parameter that is not a string, and a key such as `__proto__` or
  `constructor`, is dropped and reported.
- For `openUrl`, `deeplink` and `close`, a **verdict** on the parameters:
  `action.standard` (`{ type: 'openUrl', url }`,
  `{ type: 'deeplink', url, scheme }` or `{ type: 'close' }`) when they passed
  the check of the contract, or `action.invalid` (`{ param, problem }`) when
  one did not. Never both; your own actions have neither.
- A parameter may come from the data (`paramBindings`). It is read from the
  data of the node at the moment of the press, and an address that does not
  pass the check is **not** replaced by the literal fallback — the action is
  `invalid`.

**The renderer opens nothing by itself** — no `window.open`, no link with an
address from the document. `runStandardAction` is an optional helper you call
from your own `onAction`; it performs only `action.standard`, only with the
handlers you pass, and an app link only when its scheme is in the list you
named:

<!-- example: actions.tsx#actions -->
```tsx
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
```

Action types are free-form strings agreed between whoever builds the screens
and your app. An action your app does not know should be ignored, not thrown
on: the screen may be newer than the app.

**Trust.** The address comes from a document and from your data, both of which
travel over a network. The renderer checks it against the form of the contract
(an `https://` address without credentials, an app link whose scheme is not on
the contract's list of forbidden ones), but **you** open it, and the list of
app-link schemes that may be opened is yours: without `deeplinkSchemes`
`runStandardAction` never opens an app link.

Rules to keep:

- Open only `action.standard`. `action.params.url` of an action marked
  `invalid` is a raw string from the document — never open it.
- A parameter read from data replaces the literal only whole: there is no
  concatenation, so a document cannot glue your data to a foreign address. The
  target of `navigate` (`screenId`) is never read from data. Do not build a
  route from `action.params.screenId` either; match it against your own list.
- The form says nothing about which hosts are fine: an `https://` address of an
  internal name (`intranet.corp`) passes it, and addresses written as an IP
  never do. Which domains may be opened is your decision — keep a list.
- A `deeplink` with a scheme from your list is `standard`, but its path and
  query stay untrusted: `myapp://open?url=javascript:…` is judged by your
  router. `tel:`, `sms:`, `mailto:` and `market:` pass the form too; only your
  `deeplinkSchemes` keeps them out. Without the helper, keep such a list yourself.
- A key held down is one press (the auto-repeat is ignored), but a double click
  is two actions: protect a payment on your side.
- A package older than 0.9 receives `openUrl` and `deeplink` as an unknown
  action with raw `params` and no verdict. If you already had your own
  `openUrl` branch, update the package before managers start using the catalog.

### Analytics: what was pressed, what was shown

An action may carry `track` — `{ event, params? }`, a name of letters, digits
and underscores (at most 40) and flat string parameters. It arrives in
`onTrack`:

- **once per press and before the action** — before the renderer navigates
  (even when your `onNavigate` then cancels the step) and before `onAction`; the
  only thing that comes earlier is the [haptic request](#haptic-feedback) of the
  same press;
- for `none` too — a button that only measures;
- separately from the action: the action you get in `onAction` does not carry
  it.

The renderer sends nothing anywhere itself.

<!-- example: actions.tsx#analytics -->
```tsx
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
```

### Haptic feedback

An action may carry `haptic` — one of `light`, `medium`, `heavy`, `selection`,
`success`, `warning` — next to `track`. It is a **request to your app**: the
renderer never vibrates by itself. It calls `onHaptic(kind, source)`:

- **once per press, first** — before `onTrack` and before the action of the same
  press (the order is haptic, track, action), and also when the action is `none`
  or your `onNavigate` cancels the step;
- not for a disabled button, a held key's auto-repeat, a press that reached a
  control inside a card instead of the card, or a drag to confirm that has not
  completed (it asks when the thumb is dragged to the end, together with the
  action);
- not for an unknown word, and not at all for an action without the field — the
  renderer adds no default, a section switch included;
- separately from the action: the action you get in `onAction` does not carry it.

Map the word to what your platform can do. In a browser that is often
`navigator.vibrate`, which exists on Android and not on iOS Safari; without the
prop nothing happens.

<!-- example: actions.tsx#haptic -->
```tsx
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
```

### Screen shown

`onScreenChange` is the screen-shown event. The shown screen is the top of the
stack, and the event happens once whenever the top became another frame:

| `cause` | When |
|---|---|
| `entry` | the first screen; also after you changed `entry` or the document (the stack is built again) |
| `forward` | `navigate` put a screen on top — a modal sheet too |
| `back` | `navigate.back` (or closing a sheet) removed the top: the screen under it is shown again |
| `switch` | `navigate.section` made the named screen the **only** one in the stack (`depth` is 1, `record` is `null`); pressing the item of the screen that is already shown sends nothing |

The fields of the event:

| Field | |
|---|---|
| `screenId`, `name`, `presentation`, `documentId` | The screen that is shown. |
| `entry` | The name you passed, only if the document has it as an entry point; otherwise `null`. |
| `cause` | One of the four above. |
| `depth` | The stack length after the change; the first screen is 1. |
| `record` | The record the screen was opened with, a flat map of paths, or `null`. |
| `modalPlacement` | `'bottom'` or `'center'` — where a modal layer lies. **Only when the screen named it**: a sheet is the default, so a modal screen that did not name it has no key. |
| `statusBarIcons` | `'light'` or `'dark'` — a **request** for the icons of the system status bar, only when the screen named it. The renderer never touches the status bar; whether to honour it is yours. |

A word the renderer does not know in the last two fields is not handed over.

The event is **not** fired on:

- a re-render, new data or locale, a new object of the same document;
- an action handed to you (`openUrl`, `close`, "back" on the first screen);
- a navigation that did not happen (the screen is missing, your `onNavigate`
  cancelled it).

There is no "hidden" event. On the server nothing is fired; hydration fires
the first one. In React `StrictMode` it is still one.

### Driving navigation with your router

`onNavigate` runs before every screen change the renderer is about to make.
Return `false` and the renderer stays put; `entry` then says which screen to
show. Entry points are the public, stable names of screens
(`document.entryPoints`), meant for exactly this: URLs, push notifications,
banners.

<!-- example: actions.tsx#navigation -->
```tsx
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
```

An entry name the document does not have opens the initial screen (and reports
`unknown-entry`): names outlive documents.

The renderer does not scroll your page. If screens are taller than the
viewport, scroll to the top in `onScreenChange`.

### Pressable cards

`action` (and an optional `label`) on a `Column`, `Row`, `Container` or `Stack`
makes the whole box a button. For your handlers it is the same action a
`Button` would send — analytics first, then the action, with the record of the
list row. What differs is on the screen:

- The box is `role="button"` and comes in the order of focus before the
  controls inside it. Enter and Space press it; the auto-repeat of a held key
  does not.
- A press goes to the **innermost** control under the point, and its ancestors
  get nothing — a button inside a card does not also press the card.
- The accessible name is the `label` first and then the text of the content.

#### Long press

A pressable container or a list row may also carry **`longPress`** (an action of the
same form) and **`longPressLabel`** (its name). There is no new prop and no new
handler: a long press arrives at the very same `onHaptic`, `onTrack` and `onAction`
as a press, in that order, once, with the record of the row. `longPress` is not read
on a `Button`, an `IconButton` or a navigation item.

- **The hold.** A pointer that stays down on the node for 450 ms and has not moved
  more than 10 CSS pixels runs the action while it is still down. A longer move
  before that cancels the long press **and** the press (the finger is scrolling).
  After it fired, the click that follows the release is swallowed: `action` does not
  run. The pressed look stays while the finger is down. A node without `longPress`
  is not changed: a long hold released in place is a press, as always.
- **One receiver.** The touch goes to the innermost control under the finger. A
  button inside a card keeps its press and the card gets no long press; a row with a
  long press of its own inside a card is the receiver itself.
- **Keyboard.** `ContextMenu` or `Shift+F10` on the focused node runs the long press
  at once. `Enter` and `Space` stay the press of `action`. A container with only a
  `longPress` is a control all the same: a tab stop, `role="button"`, named by its
  content, and its click does nothing.
- **Assistive technology.** The name of the action is a hidden element the node is
  described by (`aria-describedby`), and `aria-keyshortcuts="ContextMenu Shift+F10"`
  lists the keys. The name is not part of the name of the control, and a reader that
  does not announce descriptions still has the keys.
- **The context menu of the browser** is cancelled on such a node (the browser of a
  phone opens it on the same hold). A right mouse button is not a long press and
  does nothing.

## Screen layout

### Scrolling and the app bar

A screen has three zones: the **app bar** (the first child of the screen root,
when it is an `AppBar`), the **body** (everything else) and the
[bottom zone](#the-bottom-zone-navigation-bar-and-a-pinned-block).

- The app bar stands; only the body scrolls, and only vertically.
- The background of the root lies under all zones and does not move.
- Padding of the root is shared: the app bar gets the top and the sides, the
  body gets the sides, the bottom and — instead of the top — the screen's `gap`.

The rules and numbers of the zones are data of the contract
(`x-style.layout.screen`, `bottomZone` and `navBar` in `screen-schema.json`).

Who scrolls is **your** decision, not the document's:

| `scroll` | What it means | What you do |
|---|---|---|
| `"page"` (default) | The block has no height of its own: it grows with its content and your **page** scrolls. | Nothing. The app bar sticks to the top of the viewport — see `chrome` below. |
| `"screen"` | The root fills the height you gave it and the zones work literally: the body scrolls inside the block. | Give the block a height: `100dvh`, a fixed height, a flex remainder. |

With `scroll="page"`, `chrome` says what the app bar and the bottom zone do:

- `chrome="sticky"` (default) — the app bar **sticks** to the top of the
  viewport while the screen is in view, and paints the background of the screen
  root under itself, so the content travelling beneath never shows through.
- `chrome="static"` — the app bar stays the top row of the block and scrolls
  away with the page. Use it when your site already has its own fixed header.
- `stickyOffset` — the `top` the app bar sticks at when your own header is
  fixed above the block. A number is CSS pixels; a string is a length
  (`'56px'`, `'3.5rem'`) or a CSS variable of yours
  (`'var(--site-header-height)'`). Anything else is ignored.
- While the app bar is stuck, the elements of the body that take keyboard focus
  keep clear of it (`scroll-margin-block-start` = the height of the app bar +
  `stickyOffset`).

**Modal layers.** A modal layer lies over the **whole** page under it, the app
bar included (every layer of the stack is its own stacking context).

- With `scroll="screen"` its area is the whole block.
- With `scroll="page"` the block is far taller than the window, so the area is
  the part of the block that is **visible in the window**. It is a sticky area,
  never `position: fixed`: the root clips its content, and that is a boundary
  of trust. A sheet stands on the lower edge of that part, a window in its
  middle, and the scrim covers the block.
- If you need the exact area, give the block a height of its own
  (`scroll="screen"`).

**What an app bar can hold.**

- **Actions.** The app bar draws the first two visible actions; a third and
  further are not drawn.
- **A node in the leading zone.** A child with `zone: 'leading'` (a button or
  an icon button) stands in the leading zone **instead of** the back arrow,
  whatever `showBack` says, and is not counted among the two actions. Its width
  is at most half of the bar. A node hidden by its condition gives the zone
  back to `showBack`.
- **The title.** `AppBar.titleAlign: 'start'` puts the title right after the
  leading zone instead of the middle.

Whatever you choose, the renderer never touches the status bar of the system:
the `statusBarIcons` a screen asks for arrives in `onScreenChange` for you to
honour (see [Screen shown](#screen-shown)).

### The bottom zone: navigation bar and a pinned block

The bottom of a screen holds two things, and they never scroll: a navigation
bar and a pinned block.

**Which child of the screen root stands where** is decided by the **document
order**, not by visibility:

| Child of the screen root | Zone |
|---|---|
| the first one, when it is an `AppBar` | the app bar |
| the **last** one, when it is a `NavBar` | the navigation bar |
| the last one that is left and has `pin: "bottom"` | the **pinned block** (any node: a button, a row of two buttons, a card with a price) |
| everything else | the body |

- A zone whose node is hidden by a condition does not exist, and nobody takes
  its place.
- A `pin` in any other place, or any other word, is not read — the node is an
  ordinary child.

**Geometry.**

- Top to bottom the zone is: the pinned block (with the bottom padding of the
  root under it), the navigation bar, the safe inset.
- The body ends at the top edge of the zone and finishes with the screen's
  `gap` instead of the bottom padding, so the last line of content is never
  hidden under the block.
- The navigation bar has no padding of the root: it runs from edge to edge.

**The navigation bar.**

- It draws the first five **visible** `NavItem`s in equal shares, an icon over
  a one-line label.
- It is a `<nav>`; every item is a button with the label as its name, and the
  item whose action is `navigate.section` to the shown screen carries
  `aria-current="page"`.
- Pressing an item performs its action like a button does. `navigate.section`
  makes the section the only screen of the stack (the cause of the screen-shown
  event is `switch`), and a modal layer closes with everything on top of it.
- A modal layer never draws the bar, but it does draw a pinned block at its
  bottom.

**With `scroll="page"`** the bottom zone **sticks** to the bottom of the
viewport (`position: sticky; bottom: 0`):

- `chrome` decides for both zones: `chrome="static"` leaves the zone as the
  last row of the block.
- `stickyBottomOffset` moves the line when your site has a fixed bar below. It
  takes the same forms as `stickyOffset`.
- A stuck pinned block paints the background of the screen root under itself.
- Elements of the body that take keyboard focus keep clear of the zone
  (`scroll-margin-block-end` = the height of the zone + `stickyBottomOffset`).

The renderer does not react to the on-screen keyboard — see [Forms](#forms).

### Safe areas

The renderer adds the safe-area insets itself; both props take `'env'`
(default — `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` of the
browser) or a number of CSS pixels you measured. Pass `0` when your host
already leaves the room (it wraps the screen in a safe area, or leaves space
for the home indicator). Anything else — a negative number and `NaN` for the
top inset included — counts as `0`.

| | `safeAreaTop` | `safeAreaBottom` |
|---|---|---|
| **Where it is added** | Inside the box of the app bar, above its content, so a named background of the bar covers the status bar. Without an app bar, or with one hidden: above the body area. | Under the content of the bottom zone (a pinned block, a navigation bar); the background of the bar reaches the physical bottom. In a modal sheet: inside the box of the sheet, under its content (below). |
| **When** | With `scroll="screen"`, or while the app bar sticks to the top of the window (`scroll="page"`, `chrome="sticky"`). | Only when the screen has a bottom zone. With `scroll="page"`, only while the zone sticks. |
| **Never** | Inside a modal layer. | In a window (`modalPlacement: 'center'`, or a sheet shown as a window on a `medium` or `expanded` area). |

**A modal sheet.** A sheet reaches the physical bottom of the area, so the
bottom inset lies inside its box, under its content: the background and the
radius of the sheet go on under the home indicator, and the last node (usually
the main button) stands above it. With a pinned block the inset is under the
content of that block, and it is added once. The body of a tall sheet scrolls
above the inset. If your host already pads the sheet, pass `safeAreaBottom={0}`.

**The body under the app bar.** `Screen.props.bodyTop: 'screenTop'` starts the
body at the top edge of the screen: the app bar stands over it, takes the
presses of its own box, and the content shows through it. Such a screen adds
no top inset to the content of its body.

### Adaptive layout by width

One document serves every width: it is built for a phone, and wider classes
override it. The renderer measures the width of **its own root element** — not
the window and not the device — and picks a class:

| Class | Width of the root, CSS pixels |
|---|---|
| `compact` | below 600 |
| `medium` | from 600 |
| `expanded` | from 1024 |

The width is not rounded: 599.9 is `compact`. The renderer resolves the tree
for the class and then draws it like any other document. What a document can
say per class:

| Field | |
|---|---|
| `propsOn`, `styleOn` | Override the base: `medium` on the base, `expanded` on the base with `medium`. `unset` in a layer removes the named fields before the layer is laid on. |
| `showOn` | The classes a node is shown on (together with its condition `visibleIf`). The screen root has no `showOn`: a screen is shown on every width. |
| `Screen.contentMaxWidth` | Puts the content of the body, of the pinned block, of the app bar and of the navigation bar into a centred column while the backgrounds stay edge to edge. |

#### What the host does

**Give the root a width.** The class follows the width of the element only if
the element has a width of its own (a block in a column, a grid cell). A root
whose width depends on what it draws — inside a shrink-to-fit parent, or in an
area whose scrollbar appears with the height of the content — would go round
in a loop: the class changes the content, the content changes the width, the
width changes the class. The renderer stops it with a
[lock](#the-lock-against-a-flickering-class); the real fix is a width on the
host.

**On the server, say the class if you know it.** There is no width on the
server, so the markup is `compact`. Pass `initialWidthClass` when you know the
width of the place — then the server markup and the first browser frame
already have the final layout. After the first layout the measured class wins;
anything but the three words counts as `'compact'`.

<!-- example: adaptive.tsx#adaptive -->
```tsx
/** The class of the place in the words of the document: below 600 CSS pixels `compact`, from 600 `medium`, from 1024 `expanded`. */
function classOfPlace(width: number | undefined): WidthClass | undefined {
  if (width === undefined) return undefined
  return width >= 1024 ? 'expanded' : width >= 600 ? 'medium' : 'compact'
}

export function Home({ layout, theme, columnWidth }: { layout: UiDocument; theme: ThemeContract; columnWidth: number | undefined }) {
  // The reader measures its own root element and switches to the real class after the first layout.
  // If you already know the width of the place (a desktop site, a column of a fixed width), say so:
  // the server markup and the first browser frame then have the final layout, and nothing jumps after hydration.
  return <HotlayoutScreen document={layout} theme={theme} initialWidthClass={classOfPlace(columnWidth)} />
}
```

#### What survives a resize

Resizing the host switches the class without losing anything: the stack of
screens, the chosen options, typed text, the position of the carousels and the
focus stay.

- The body of the screen is **not rebuilt**. The root has one shape of markup
  on every class and with every combination of zones (root → body zone → body
  padding → content column → children), so a class that turns on
  `contentMaxWidth`, hides the app bar or the pinned block changes styles only.
- A text field stays the same element: it keeps the focus and an unfinished IME
  composition. An expanded accordion stays expanded.
- The items of the navigation bar are built again when the bar moves between
  the bottom and the app bar; an item that had the focus has it again in the
  new place.

#### The navigation bar and modal sheets on a wide place

**The navigation bar.** On `medium` and `expanded` the bar stands at the
**top**; on `compact` it is always at the bottom.

- With an app bar that is shown in this class and by its condition, the items
  go inside it — into the trailing zone, before the actions, icon and label
  side by side. Without one, the bar is a bar of its own, edge to edge.
- `widePlacement: 'bottom'` on the bar keeps it at the bottom on every width.
- When the items do not fit, the labels of **all** of them are hidden together
  (they stay the accessible name of the button), then the title shrinks to
  nothing, and what still does not fit is clipped at the end of the bar.
- The view depends on the width alone — on the natural width of the **text** of
  the title and of the labels — so the same width gives the same view whether
  the bar was being narrowed or widened.
- The bottom zone of a wide screen is the pinned block only; the safe inset is
  added only while that zone exists.

**A modal sheet.** A modal screen without `modalPlacement` (or with `bottom`)
is a sheet on `compact` and a **window in the middle** on `medium` and
`expanded`.

- The window is at most 560 wide and at most 85 % of the height of the area
  (or the area without margins — the lesser). The body scrolls while the header
  of the layer stays.
- The class of the **content** of the layer is taken from its own box, so a 560
  window is always `compact` even over an `expanded` page.
- `modalPlacement: 'center'` is a window on every width.
- Closing, focus and `inert` under the layer are the same as for a sheet.

#### The lock against a flickering class

This is what the renderer does when the width of the root depends on its own
content (see "Give the root a width" above).

- **How a loop is recognised.** Four changes of the class within half a
  second. There are three classes, so the fourth change in a row always returns
  to a class that was already shown, whether the loop has two classes or three;
  a loop makes one change per repaint, and a person does not cross a class
  boundary four times in half a second on purpose.
- **What the lock does.** The class becomes the **narrowest** of the classes of
  the loop and stops changing.
- **When the lock is lifted.** Under the lock the class is constant, so the
  layout is, so the width is. A width that **changes** under the lock (by more
  than half a pixel) was changed by the host — a window, a column — and not by
  the content: the lock is lifted and the class is taken from the new width. If
  the loop starts again it is locked again; every lift is paid for by a real
  change of the width, so this cannot run forever.
- **Jitter at a boundary.** Dragging the edge of a window back and forth over
  600 or 1024 looks like a loop of two classes and is locked like one. It is
  told apart by the width under the lock, which is not the width the "loop"
  showed for that class. Such a lock is lifted by the next change of the width
  like any other, and if the width never changes again, by itself after one
  second (the class is then taken from the measured width; a real loop is
  locked a second time, and then for good). So a window that comes to rest at
  900 is `medium`, never `compact`.

## Data

`data` is a flat map from data-contract path to value; `collections` holds the
lists for `Repeater` widgets. A value that is missing draws the `fallback` the
manager typed in the builder, and conditions follow the contract's rule for
missing values — the screen is always whole, with or without data, so you can
render first and fill the data in when it arrives.

Dates are bound as ISO strings and formatted by the renderer
(`Intl.DateTimeFormat`, the shown language, the device's time zone unless
`timeZone` is given).

### Sentences, numbers, money and plurals

A text can be a **template** — one translatable sentence with named places,
`"{days} {unit} left · {price}"` — and a binding can say how its value is
written. All of it is document data; you only pass `data` as before:

| In the document | On the screen | |
|---|---|---|
| `format: 'number'` | `1,850` / `1 850` | Group and decimal separators of the shown language, grouping always on, up to three fraction digits. |
| `format: 'currency'`, `currency: 'JOD'` | `120 JOD`, `1,850.50 USD` | The amount, a no-break space, the ISO 4217 code — the same order in every language. A whole amount has no fraction; otherwise the digits of the currency. |
| …with `currencyDisplay: 'symbol'`, `currencyPosition: 'before'`, `sign: 'always'` | «+42 000,50 ₴» | See [Money](#money) below. |
| `format: 'date'` with `dateParts` | day and month; weekday, day and month; day, month and year | `dayMonth`, `weekdayDayMonth`, `dayMonthYear` choose which parts of the date are written. |
| `format: 'daysUntil'` | `4` | Whole days until the bound moment, rounded **up**, never below zero: `max(0, ceil((moment − now) / 24 h))`. No time zone is involved. |
| `format: 'countdownPart'`, `unit: 'days' \| 'hours' \| 'minutes' \| 'seconds'` (and `pad: 2`) | `2`, `14`, `05` | One part of the time left until the bound moment, **rounded down**: days, hours 0–23, minutes 0–59 or seconds 0–59; past moments give zeros. It is written like `number`; `pad: 2` writes at least two digits (`05`). A sentence composes the parts with its own words — `"{h}:{m}:{s}"`, `"{d} d {h} h"` — and a part is the number a plural word agrees with. |
| a `plural` value | `day` / `days`, `день` / `дні` / `днів` | The form whose CLDR category matches the number (`Intl.PluralRules`). The language is the one the shown forms are written in — the translation's if the forms are translated, the document's own otherwise — never the device's. |

The sentence and the plural forms are translated in the document
(`localization`), so a translator can reorder the places. A place whose value
has no data shows that value's own fallback and the rest of the sentence stays
(`— / 5 steps`); a place the document does not declare is drawn literally,
braces included — a typo is visible, not silent.

#### Money

Without the three fields below a currency is written with its code after the
amount. Each field is optional and changes one thing:

| Field of the binding | What it does |
|---|---|
| `currencyDisplay: 'symbol'` | The sign of the currency instead of its code (`₴`, `$`, `€`…), from a closed table of twelve codes. A code the table does not have stays a code, in the same place. |
| `currencyPosition: 'before'` | The currency before the amount, in every language. |
| `sign: 'always'` | A plus for a positive number. The minus is U+2212; zero has no sign. |

- In text shown right to left the composed form is wrapped in the isolation
  marks U+2066 … U+2069, so the sign, the amount and the currency keep their
  order.
- `Text.spans[place].parts` (`fraction`, `currency`) gives the decimal part and
  the currency a style of their own — small cents next to a large amount.

#### What the renderer expects from your data

These are the contract's rules, the same in every reader.

- **Numbers as numbers.** The string `"1850"` is not a number: it is shown as
  it is and takes the plural form `other`. Do not format values yourself.
- **Dates as ISO 8601 with a time and a zone** — `2026-10-14T09:00:00Z`,
  `2026-10-14T12:00+03:00` — **that exist in the calendar**. Anything else is
  *not a date* for all four date formats and is shown as it is: `2026-10-14`,
  `2026-10-14T09:00:00` (no zone), a timestamp number, `"1850"`, and also
  `2026-02-30T00:00:00Z`, month 13, `24:00`. Dates are written in the
  Gregorian calendar in every language.
- **A locale the platform has no date data for** (`dv`, `la`) leaves the date
  as the string your data has.
- **Image addresses in data.** The renderer asks `resolveImageUrl` first; with
  no answer from you only `https:` (up to 2048 characters) is drawn. Your
  answer is final up to 512 KB per address.
- **Icon names in data.** A node can take the **name** of its icon from data
  (`iconPath`). Only a name of the embedded set is drawn; anything else is an
  empty box of the same size. Mirroring in a right-to-left screen follows the
  resolved name.
- **An empty string is "no value".** `""` shows the fallback of the binding,
  under any format; a string of spaces, `0` and `false` are values. Inside a
  list row an empty field still belongs to the row — it shows the fallback,
  not the value your `data` has at the same path.
- **No data, numeric fallback.** When a value has no data and its fallback
  looks like a number (`0`, `12`, `1.5`), a plural agrees with that number:
  "0 points", «0 балів». A fallback like `—` gives the form `other`.
- **Numbers above 2^53 − 1** (in absolute value) are not formatted and do not
  pick a plural form: the value is shown as it is.
- **A locale the platform has no number data for** leaves `number` and
  `currency` values as they are and writes `daysUntil` as a plain integer.
- **A template value the renderer does not understand** — an unknown kind, or
  a known kind of the wrong shape — draws an empty place, the sentence stays,
  and `onReport` gets `ignored-input`.

**`now` is the renderer's clock.** `daysUntil` and the parts of `countdownPart`
are counted when the screen is rendered, from `now` — by default the clock of
whoever renders. `daysUntil` does not tick: re-render the screen (new `now`, new
data) when you want a fresh number. **A countdown does:** a screen that shows a
`countdownPart` keeps one timer, every second when a part is `seconds` and every
minute otherwise, and none when no node counts down; the number is never more
than one tick behind the clock, and a hidden tab draws nothing until it is
visible again. When you pass `now` yourself the clock is yours and nothing
ticks — pass a new moment when you want a new number. Pass `now` explicitly in
three cases: server rendering ([below](#server-rendering-and-nextjs)), tests,
and previews of sample data.

### One screen, many records

A list row usually opens a details screen for *that* record, and the renderer
does it by itself: **an action carries the record of its node**.

- A `navigate` pressed in a list row (a `Repeater` instance) opens the screen
  **with that row's record**. The paths of the record (`item.name`,
  `item.price`) are read from it first and everything else from `data`. Going
  back drops the record; another row opens another record.
- Every action that reaches you says which record it is about in
  **`source.record`** — a flat map of paths, `{ 'item.id': '42', 'item.name':
  'Coffee set' }`. A button in a list row carries the row; a button on a
  screen opened from a row carries that row too. This is how the app learns
  *which* reward to redeem:

<!-- example: actions.tsx#screen-data -->
```tsx
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
```

The rules, in full (the same in the mobile renderer):

| The action is pressed… | `navigate` opens the screen… | `source.record` |
|---|---|---|
| in a list row | with the row's record (laid over the record of its own screen) | the same record |
| outside a list, the target is a **page** | **without** a record — "Back to catalog" from a details screen is a clean catalog | the record its screen was opened with, if any |
| outside a list, the target is a **modal** sheet | with the record of the screen beneath — "Redeem *{item.name}*?" is about the same record | the same |

An action can also say it explicitly: `navigate` with **`carryRecord: true`**
opens a **page** from a screen button with the record of its own screen — "Choose
delivery" on the details of a reward is about the same reward. Only exactly `true`
counts; a plain `navigate` keeps the rule above.

A screen opened without a record (an `entry`, a button outside a list) reads
`item.*` from `data`, as before: put the record there yourself — for example,
the one the user picked with a `ChoiceGroup` (see [Writes](#writes-the-document-names-the-path)).

Three things to know:

- **The record is stronger than `data`.** On a screen opened from a row,
  `data['item.name']` is not read while the record has a name. A field the
  record does not have — or has as `null` — is read from `data`.
- **The record follows the data.** The row is remembered with the list it came from
  and with its `id` (see [A page follows the data](#a-page-follows-the-data)): when
  you pass other `collections`, an open details screen shows the new values of that
  record on the spot. A record without an `id` stays as it was when the row was pressed.
- **Treat an id from `source.record` as user input.** The values are yours
  (they come from `collections`), but which collection a prefix such as
  `item` names is decided by the document. Check on your backend that this
  user may redeem that reward.

If you cancel a navigation in `onNavigate` (your router owns the URL), the
renderer opens nothing and carries nothing: `event.source.record` is the
record to put into `data` for the screen you open.

A condition on a collection (`{ path: 'items', op: 'isEmpty' }` — the empty
state of a list) reads the list you pass in `collections`: a missing list is an
empty one.

### A page follows the data

Give the renderer new `collections` (a new object, as your state changes) and every
screen of the stack that was opened from a list row looks its record up again — the
details page, the sheet above it, the page that was carried a record with
`carryRecord`. The key is the field `id` of the record (`item.id` for the entity `item`):
a non-empty string or a finite number, compared by JSON type, so `7` and `"7"` are two
records. The record is searched for in the collection the row came from, and then in
every other collection **the document names** for the same entity (the `source` of
every `Repeater` with that `item`) — a task that moved from `tasks` to `doneTasks` is
still found. The first record with the key wins and replaces the old one whole.

What does not change: the stack, `onScreenChange` (a refresh is not a show), analytics,
the scroll, the carousels and what was typed. The page is not rebuilt; a bound number
with `animateChanges` counts to its new value. A record that is found nowhere stays as
it was last seen — a page does not go blank because a list was reloaded — and the next
`collections` are searched again. An action from the page hands you the refreshed
`source.record`. If you used to close and reopen the page to show a changed record, you
can stop.

### Writes: the document names the path

A `ChoiceGroup` bound to a path reports the user's choice through `onWrite`;
put it into `data` if other widgets should see it. The path comes **from the
document**, so treat it as input:

<!-- example: security.tsx#write -->
```tsx
/** The only paths this screen may write to — from your project's data dictionary. */
const WRITABLE = ['item.selectedId', 'survey.answer'] as const

export function Survey({ layout, initial }: { layout: UiDocument; initial: DataScope }) {
  const [data, setData] = useState<DataScope>(initial)
  return (
    <HotlayoutScreen
      document={layout}
      data={data}
      writablePaths={WRITABLE}
      onWrite={(path, value) => {
        // A FLAT map keyed by the path — never `lodash.set(state, path, value)`:
        // the path is chosen by the document, and a deep setter turns it into a property walk.
        setData((current) => ({ ...current, [path]: value }))
      }}
    />
  )
}
```

- With `writablePaths`, a write to any other path never reaches `onWrite`; it
  is reported as `ignored-input`, and the choice stays local to the group.
- **Without `writablePaths` the document may name any path** made of
  dot-separated identifiers. Paths with a `__proto__`, `constructor` or
  `prototype` segment are refused in both cases.

### Write actions and choice

`setValue` and `toggleValue` are actions of the catalog that **the renderer
performs**; a button, an icon button, a list row with an action or a
[pressable card](#pressable-cards) can carry them. `setValue` puts a literal
(a string, a flag or a number, by `valueType`) under a path of the data
dictionary; `toggleValue` flips the flag under it.

A press does two things, in this order, and nothing more:

1. the analytics event of the action (`onTrack`, once, also when nothing is
   written);
2. the write — into the session of the renderer and to `onWrite(path, value)`
   with a typed value.

`onAction` is **not** called for them, valid or not.

- **The same gate as an input field.** `writablePaths`, the form of the path,
  no `__proto__` / `constructor` / `prototype` segments. A path the gate
  refuses is written nowhere and is reported as `ignored-input`; so is an
  invalid action.
- **The path and the value are literals of the document.** A binding next to
  them (`paramBindings`) is never read, so data cannot choose where the
  document writes.
- **The same value is not written twice.** The current value is read with the
  data of the node (the record of the list row, the session, your `data`):
  pressing an option that is already chosen writes nothing, and a
  `toggleValue` writes the negation of what is shown.

How such a node is announced:

| The node carries | It is | Semantics |
|---|---|---|
| `setValue` with a value | an **option** | `role="radio"` with `aria-checked`, chosen when its value lies under its path. Options that are children of one parent and write the same path are one group; each says its place (`aria-posinset` / `aria-setsize`). |
| `toggleValue` | a **toggle** | `aria-pressed` |
| `setValue` without a value ("clear"), or an invalid action | a plain button | — |

The state is recomputed from the data on every change. The renderer draws no
look of «chosen» of its own — put it into the `styleWhen` of the node. Every
option is a tab stop; there is no arrow-key navigation between them.

## Forms

A document can ask the person for things: `TextField` (one line or several, with
a label, a placeholder, a helper and an error), `Switch` and `Checkbox`. The
value of each is a **data path** — the same flat map you already give as `data` —
and every change the person makes is written there at once.

- **The renderer keeps what was written** for the lifetime of the flow (same
  `documentId` and `entry`), so `visibleIf` conditions and bound texts of the
  screen update on every keystroke even if you do nothing with `onWrite`.
- **`onWrite(path, value)` is called at the same moment**, with a value typed
  by the widget — see the table below.
- **A value you put into `data` under the same path wins** over what the
  person typed: that is how you normalise input or clear a field. A value of
  another type under the path (a number under a text field) is an empty field.

| Widget | `onWrite` receives |
|---|---|
| `TextField` | a **string**, on every change; a cleared field writes `""`; an IME composition is written when it ends |
| `TextField` with `valueType: 'number'` | a **number**, or `""` when the text is not a number — see [below](#required-fields-a-disabled-button-a-number-field) |
| `Switch`, `Checkbox` | a **boolean** |
| `ChoiceGroup` with a bound value | the chosen option, a **string** — a choice is written like a field, so the conditions and the buttons of the screen see it at once |

<!-- example: forms.tsx#forms -->
```tsx
/** The paths the profile screens may write to — from your project's data dictionary. */
const FORM_PATHS = ['form.fullName', 'form.email', 'form.phone', 'form.comment', 'form.agreed', 'settings.notifications', 'settings.marketing'] as const

export function ProfileForm({ layout, initial, trusted }: { layout: UiDocument; initial: DataScope; trusted: boolean }) {
  const [data, setData] = useState<DataScope>(initial)
  // The document has no validation rules: you say what is wrong, as a string under the path the field's `error` is bound to.
  const phone = data['form.phone']
  const phoneError = typeof phone === 'string' && phone !== '' && !/^\+?[\d\s()-]{7,}$/.test(phone) ? 'Enter a phone number' : ''
  return (
    <HotlayoutScreen
      document={layout}
      data={{ ...data, 'form.phoneError': phoneError }}
      writablePaths={FORM_PATHS}
      // A document from a source you do not control: no autofill hints at all.
      autofill={trusted}
      onWrite={(path, value) => {
        // Called on EVERY keystroke with a string, and on every press of a switch or a checkbox with a boolean.
        // The value is user input — check it again on your backend. Throttle what you send over the network yourself.
        setData((current) => ({ ...current, [path]: value }))
      }}
    />
  )
}
```

**What you must do**

- **Treat every written value as user input.** `onWrite` receives what the
  person typed, exactly (no trimming); check it on your backend before you trust
  it. The `error` of a field is a string that **you** put into `data` under the
  path the document bound it to — there are no validation rules in the document.
- **Throttle yourself.** `onWrite` is called on every keystroke and the renderer
  adds no delay; a network write per keystroke is your decision.
- **Mind autofill.** A text field asks the browser only for the hint its
  keyboard names (`email`, `tel`, `url`) and never for credentials, cards,
  postal addresses or one-time codes. A field the document hides from the eye
  (`visibleIf`, a zero-size style) can still be autofilled by a browser, and
  the value would be written. For a document from a source you do not fully
  control, pass `autofill={false}`.
- Keep `writablePaths`: the path is named by the document, as for a choice group.

**What the renderer does**

- A field without a readable path (a document not built by the builder) works
  locally and writes nothing. A value the platform filled in before the person
  touched the field is neither kept nor written.
- `maxLength` counts Unicode code points and cuts the input; `lines` (1–8) makes
  a `textarea`. The key of the on-screen keyboard is "next" (focus moves to the
  next field of the screen) or "done"; it never runs an action, and there is no
  `<form>`, so Enter submits nothing.
- The content of an `email`, `phone`, `url` or `number` field always runs left
  to right; alignment follows the direction of the screen.
- `disabledIf` makes a field unfocusable, silent and half transparent.
- The on-screen keyboard is the browser's business: the renderer does not listen
  to `visualViewport`, and the focused field keeps clear of a stuck bottom zone
  through the scroll margin of the body.

**What a document can add to the box of a text field** — nothing here reaches
your handlers:

- the look of the box itself: `fieldRadius`, `fieldBackground`,
  `fieldBorderColor`, `fieldBorderWidth`, and `fieldHeight` (not read by a
  multi-line field);
- a mark at the start and at the end of the box (`prefix` / `suffix`): up to
  eight code points of text or an icon. It is never the value and is never
  written; a press on it focuses the field;
- a character counter (`counter`): in code points, only with `maxLength`; read
  with the field, not announced on every key.

### Required fields, a disabled button, a number field

This is what a short survey needs. **The renderer decides everything here from
the document and from what the person typed; there are no props and no
callbacks for it.**

**`required`** on a `TextField`, a `Checkbox` or a `ChoiceGroup` (only the
literal `true`):

- an asterisk after the label (colour `danger`, hidden from screen readers)
  and `aria-required`;
- **no text of the renderer's own** ("fill in this field"), and a field is
  never put into the error state because it is empty — the error stays the
  string you put into `data`.

**A form is the screen.** A field counts as *filled* by the **value under its
path**, read through the layers (what the person typed, then `data`): a text
you can hear, a number, `true`, a non-empty choice.

- Not counted: a field hidden by `visibleIf` or disabled by `disabledIf`, and a
  list drawn from data (`Repeater`).
- Counted: a field in a tab that is not open.

**`requiresFilled`** and **`disabledIf`** on a `Button` or an `IconButton`: the
button is disabled while the form of its screen is not filled, or while the
condition holds.

- A disabled button is drawn at half opacity, keeps its place and **stays in
  the tab order** (`aria-disabled="true"`, not the `disabled` attribute).
- Touch, Enter and Space do nothing — no `onAction`, no `onTrack`, no
  navigation.
- It comes alive **the moment the form is filled**, with the first letter,
  without waiting for your `data`.

**A number field** — `TextField` with `valueType: 'number'`: a numeric keyboard
(`inputmode="decimal"`), one line, left to right.

- **What counts as a number.** The typed text is read by the contract's own
  rule, not by `Number()`: a minus, digits — Latin, Arabic-Indic or Persian —
  one separator `.` `,` or `٫`, at most 15 digits; no groups, no exponent.
- **What is written.** `onWrite` receives a **number**; a text that is not a
  number, or a cleared field, writes **`""`** (never `null`), and the field
  keeps what was typed.
- **What is shown from data.** A number in `data` is shown as plain ASCII
  digits with a dot; a string under the path of a number field is an empty
  field.
- **The error state.** Once the user leaves the field, a non-empty text that is
  not a number puts it into the error state (the same look as a non-empty
  `error` from your data, and `aria-invalid="true"`). While it is focused, or
  once the text is a number or empty, there is no such state. The renderer adds
  no text: the `helper` of the field says what to type.

<!-- example: forms.tsx#survey -->
```tsx
/** A survey: required fields, a button that waits for them, a number field. The renderer decides; you only receive and check. */
const SURVEY_PATHS = ['survey.goal', 'survey.name', 'survey.age', 'survey.comment', 'survey.agreed'] as const

export function Survey({ layout, send }: { layout: UiDocument; send: (answers: Readonly<Record<string, string | boolean | number>>) => Promise<void> }) {
  const [answers, setAnswers] = useState<Readonly<Record<string, string | boolean | number>>>({})
  return (
    <HotlayoutScreen
      document={layout}
      writablePaths={SURVEY_PATHS}
      onWrite={(path, value) => {
        // A number field writes a NUMBER, or `""` when the text is not a number or was cleared ("there is no number") — never `null`.
        setAnswers((current) => ({ ...current, [path]: value }))
      }}
      onAction={(action) => {
        // A button with `requiresFilled` / `disabledIf` never reaches here while it is disabled — but a disabled button is a convenience,
        // not protection: check the answers again before you accept them.
        if (action.type === 'survey.send' && typeof answers['survey.age'] === 'number') void send(answers)
      }}
    />
  )
}
```

A disabled button is a convenience for the person, **not protection**: a hostile
document simply does not set `requiresFilled`. Check what you receive.

## Theme

The theme is a separate JSON file with its own version: a rebrand replaces the
theme and touches no screen. One file holds a set of themes (typically `light`
and `dark`) and names the default one.

<!-- example: theme-and-fonts.tsx#theme -->
```tsx
// 1. No theme: the built-in starter theme (light; `themeId="dark"` for the dark one).
export const builtIn = <HotlayoutScreen document={layout} />

// 2. Your project's theme — the parsed `theme/published.json`.
export const own = <HotlayoutScreen document={layout} theme={projectTheme} themeId={prefersDark ? 'dark' : undefined} />

// 3. The theme by URL: a designer republishes it, the app picks it up without a release.
export function Themed({ themeUrl }: { themeUrl: string }) {
  const [theme, setTheme] = useState<ThemeContract>()
  useEffect(() => {
    const controller = new AbortController()
    loadTheme(themeUrl, { signal: controller.signal })
      .then(setTheme)
      .catch(() => undefined) // no theme is not an error: the built-in one is drawn
    return () => {
      controller.abort()
    }
  }, [themeUrl])
  return <HotlayoutScreen document={layout} theme={theme} onReport={(report) => { console.warn('hotlayout', report) }} />
}
```

A theme that cannot be read (another major, not an object, no themes) never
blanks the screen: the built-in theme is drawn and `onReport` gets
`theme-fallback`. A document may name a token the theme does not have; the
property is then skipped (or the field default is used) by the contract's
policy — the renderer never substitutes a "similar" colour.

Theme values become CSS variables (`--product-*`) on the screen's root element
and nowhere else.

## Fonts

**The package does not ship or load font files.** The theme *names* the
typefaces — `fontFamilies.body` and `fontFamilies.heading`, each with a
`primary` family and a `fallback` stack — and the renderer writes them into
`font-family`. Making the primary family available is the page's job, exactly
as with any other CSS.

What to load, for any theme:

<!-- example: helpers.ts#fonts -->
```ts
/** What the page has to load for this theme: families and the weights actually used. */
export function fontsOf(contract: ThemeContract, themeId?: string) {
  const { theme } = resolveTheme(contract, themeId)
  const weights = (role: 'body' | 'heading') => [...new Set(Object.values(theme.typography).filter((style) => style.role === role).map((style) => style.fontWeight))].sort()
  return {
    body: { family: theme.fontFamilies.body.primary, weights: weights('body') },
    heading: { family: theme.fontFamilies.heading.primary, weights: weights('heading') },
  }
}
// For the built-in theme: body — Inter 400, 500, 600; heading — Inter 700.
```

Then load it any way you like. From a font service, in the page `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
```

or self-hosted, in your global stylesheet:

```css
@font-face {
  font-family: 'Inter'; /* exactly the name the theme uses */
  src: url('/fonts/Inter-Variable.woff2') format('woff2');
  font-weight: 400 700;
  font-display: swap;
}
```

Three things to know:

- **The family name must match the theme's, character for character.** Some
  font loaders register the font under a generated name (check the computed
  `font-family` of a heading if you use one, e.g. `next/font`); the renderer
  asks for the name written in the theme.
- **Arabic and other scripts.** A Latin typeface has no Arabic glyphs; the
  browser then takes them from the next family in the stack. If the brand has
  an Arabic typeface, ask the designer to put it in the theme's `fallback`
  list (or use a typeface that covers both) and load it the same way.
- **Without the font nothing breaks, but the screen is not the one that was
  designed.** The fallback stack is used (`system-ui, …`), so line breaks, the
  width of buttons and badges and the height of multi-line text differ from the
  builder's canvas and from the mobile app. If a screen looks "almost right",
  check the font first.

`@font-face` must be declared at page level. If you render the screen inside
your own shadow root, the declaration still belongs to the document.

## Languages and right-to-left

Pass the **user's locale as the platform gives it** — `navigator.language`, the
`Accept-Language` winner, `ar_EG` from a mobile bridge. Translations live **in
the document** (`localization`), where the manager edits them in the builder,
and the renderer finds the right one itself.

<!-- example: theme-and-fonts.tsx#locale -->
```tsx
export const arabic = (
  <HotlayoutScreen
    document={layout}
    locale={navigator.language} // the user's locale as the platform gives it: `ar-EG` finds the document's `ar` — translations, Egyptian date formats, direction (rtl)
    timeZone="Africa/Cairo" // dates are written in this zone — on the server and in the browser alike
    labels={{ back: 'رجوع' }} // the accessible name of the back arrow is the renderer's text, so it is yours to translate
  />
)

// A language the document has no translation for is shown in the document's own language,
// and the direction follows what is actually shown. Force it only if you know better:
export const forced = <HotlayoutScreen document={layout} locale="en" dir="rtl" />
```

**How the translation is found** — the contract's rule, the same in the mobile
renderer:

1. `_` equals `-` and case does not matter: `ar_EG`, `ar-eg`, `AR-EG` are one
   tag.
2. Subtags are dropped from the end until a language of the document matches
   (RFC 4647 Lookup): `ar-EG` → `ar`; `zh-Hant-TW` → `zh-Hant` → `zh`.
3. It never goes the other way: `locale="ar"` does **not** pick a document's
   `ar-EG`, and `pt-BR` does not pick `pt-PT`. Guessing a region would show
   people the wrong text silently — the builder warns the manager about a
   regional translation without its base language instead.
4. No match → the document's own language.

The answer is one per document: a string that has no translation in the chosen
language falls back to the document's own text, not to a third language.

Known limit: `zh-TW` falls to `zh` (usually Simplified) although Taiwan writes
Traditional — the rule drops subtags and does not consult script data. Give the
document a `zh-TW` translation if you serve Taiwan.

**What follows from the answer:**

- **Dates** are formatted with the **requested locale** when a translation was
  found (`ar-EG` gives Egyptian formats next to Arabic text) and with the
  document's own language when it was not — never Arabic digits next to
  English text.
- **Direction** follows the language that is actually **shown**, not the one
  that was asked for: no Arabic in the document → left to right. It is a
  property of the script and comes from CLDR (`Intl.Locale`), not from a list
  in this package. It is set as `dir` on the screen's root only — your page is
  not touched.
- **Layout is logical throughout** (`start` / `end`): rows, paddings, corner
  radii and the back arrow flip; icons the contract marks as directional are
  mirrored; the tab strip's arrow keys swap.
- **Values from your data are not translated** — the backend already answered
  in the user's language.

When your own chrome has to speak the same language as the screen, ask the
same function the component uses:

<!-- example: helpers.ts#shown-language -->
```ts
/** The renderer's own texts (`labels`) in the language the screen is actually shown in. */
const BACK_LABELS: Readonly<Record<string, string>> = { en: 'Back', ar: 'رجوع', uk: 'Назад' }

export function backLabelFor(document: UiDocument, deviceLocale: string): string {
  const { translation } = resolveLocale(deviceLocale, document.localization?.locales ?? [], document.localization?.defaultLocale)
  return BACK_LABELS[translation ?? 'en'] ?? 'Back'
}
// backLabelFor(layout, 'ar-EG') → 'رجوع' when the document has `ar`; 'Back' when it only has `ar-SA` or no Arabic at all
```

## Server rendering and Next.js

`renderToString` and streaming work: nothing touches `window` or `document`,
and the stylesheet and the theme variables are part of the markup.

**The screen is in the first part of the response.** The component puts no
`Suspense` boundary around the screen, so a streaming renderer
(`renderToPipeableStream`, `renderToReadableStream`, the Next.js App Router)
has nothing of the screen to send later: the first screen arrives as ordinary,
fully styled HTML, with no placeholder in its place and no script that swaps
it in. A reader with JavaScript off and a crawler see the screen; with
JavaScript on it becomes interactive when it hydrates. The same holds for a
page Next.js prerenders at build time. (If you wrap the component in a
`Suspense` boundary of your own, React may send your fallback first — that is
how streaming treats any large boundary.)

**Next.js App Router: no wrapper needed.** The package marks its component as
a Client Component itself (`"use client"` inside the build), so you can put
`<HotlayoutScreen>` straight into a Server Component. The helper functions are
*not* client code — `checkDocumentVersion`, `loadDocument`, `loadTheme` and
`resolveTheme` can be called on the server:

<!-- example: next.tsx#next-server -->
```tsx
// app/rewards/page.tsx — a Server Component. No "use client", no wrapper of your own.
export default async function RewardsPage() {
  const [layout, theme] = await Promise.all([loadDocument(DOCUMENT_URL), loadTheme(THEME_URL).catch(() => undefined)])
  if (checkDocumentVersion(layout.schemaVersion).kind === 'incompatible') return <p>This screen needs a newer app.</p>
  // `now` is read once on the server and travels to the browser with the props: both count "days left" from the same moment.
  const now = new Date().getTime()
  return <HotlayoutScreen document={layout} theme={theme} locale="ar" timeZone="Asia/Dubai" now={now} style={{ minBlockSize: '100dvh' }} />
}
```

Navigation between the document's screens, tabs, accordions and modal sheets
work on such a page after hydration. The one thing a Server Component cannot
do is pass **callbacks** — that is React's rule, not ours. When you need
`onAction` and friends, the screen goes into a Client Component of yours:

<!-- example: next.tsx#next-client -->
```tsx
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
```

Four things to set or know when you render on a server:

- **Set `timeZone` whenever a screen with dates is rendered on a server.** A
  server usually runs in UTC and the browser does not; the same moment
  formatted twice gives two texts ("Oct 31" and "Nov 1"), and React reports a
  hydration mismatch. With `timeZone` both sides write the same text. Pick the
  zone that is true for the user (their profile, your market) — or omit the
  prop and render date-bound screens on the client only.
- **Set `now` for the same reason** when the document counts days
  (`daysUntil`): the server and the browser render at different moments, and a
  deadline that crosses a 24-hour boundary in between gives "4 days left" in
  the markup and "3 days left" after hydration. In a Server Component read the
  clock once and pass it down — the number travels to the browser with the
  props, as in the first example above. A countdown (`countdownPart`) is the
  same case twice: with your `now` the markup of the server and of the first
  browser frame is the same; without it the two clocks differ, the text of a
  countdown is exempt from the hydration check, and the browser's clock replaces
  the server's number as soon as the page is interactive.
- **Reports (`onReport`) fire in an effect**, i.e. in the browser. On the
  server use `checkDocumentVersion` and `resolveTheme(theme).reports` if you
  want to log fallbacks there.
- **A screen that throws while rendering on the server does not fail the
  response**: the status stays 200, the rest of your page is rendered, and the
  markup carries the neutral notice (`renderError`) in place of the screen.
  The browser hydrates that markup as it is and reports `render-error`. What
  was drawn before the part that threw is in the markup but not displayed (the
  package stylesheet hides it with `:has()`; a browser without `:has()` shows
  it above the notice until hydration).

The width class on the server is `compact` unless you say otherwise — see
[Adaptive layout by width](#adaptive-layout-by-width).

## Styles and isolation

The renderer lives in the regular DOM of your page.

- **It does not leak out.** Every visual decision is an inline style; theme
  values are CSS variables (`--product-*`) set on the root element; the
  stylesheet contains only selectors scoped to `[data-hotlayout]`, plus the two
  global at-rules motion needs (`@property --hl-motion-phase` and
  `@keyframes hl-motion-cycle`: such names cannot be scoped, so they are
  prefixed). Nothing is added to `<head>`, `<html>` or `<body>`.
- **Your page does not leak in.** A scoped reset (`all: unset`) with the
  specificity of an id selector removes whatever your global CSS gives to
  `button`, `div`, `img`, `p`, `*`… inside the screen, and the root restates
  every inherited text property. The reset matches descendants of the
  package's own root only — never an element of yours.
- **Nothing is drawn outside the root.** The root clips its content
  (`overflow: clip; contain: layout paint`). If the screen should scroll inside
  a fixed-height box, give the root `style={{ overflow: 'auto' }}` yourself.
- **Inherited properties you set on purpose.** `font-family`, `color`,
  `line-height` and the rest are restated on the root, so a `body` font does
  not reach the screen. That is intended: the screen's typeface is the theme's.

**The limit: `!important`.** A host rule marked `!important` still wins over
the reset *and* over inline styles — `button { border-radius: 0 !important }`
squares every button of the screen. Only Shadow DOM stops that, and it was not
chosen because it breaks server rendering with hydration and hides the screen
from your tests and tooling. If your CSS has global `!important` rules, either
scope them away (`:not([data-hotlayout] *)`) or render `HotlayoutScreen` into
your own shadow root.

### Strict Content-Security-Policy

Inline `style` attributes need `style-src 'unsafe-inline'` (or
`style-src-attr 'unsafe-inline'`). The inline `<style>` element can be avoided:

<!-- example: csp.tsx#csp -->
```tsx
import '@hotlayout/react/styles.css'

import { HotlayoutScreen } from '@hotlayout/react'
import type { UiDocument } from '@hotlayout/react'

export function StrictCsp({ layout }: { layout: UiDocument }) {
  return <HotlayoutScreen document={layout} injectStyles={false} />
}
```

Images are loaded from the URLs in the document and in your data, so `img-src`
must allow those hosts — and only those: see the recommended policy in
[Security model](#security-model).

### Hooks for tests and analytics

Each node's box carries `data-hl-node="<node id>"` and `data-hl-type`, each
screen layer `data-hl-screen` and `data-hl-presentation`. Node ids are stable
across republishing as long as the manager does not delete the node.

## Security model

The layout document and the theme arrive over the network, and whoever can
publish them can change what your users see. The builder validates both on
publish, but **the renderer does not rely on that**: every value is parsed
again at the point where it becomes CSS, an address or a key.

### What the package guarantees

For an untrusted document and theme:

1. **A value never becomes CSS it was not meant to be.** Each value is parsed
   by an allow-list of its form before it reaches a style:

   | Value | Accepted form |
   |---|---|
   | a colour | `#rrggbb` / `#rrggbbaa` and nothing else — not `red`, not `var(…)`, not `url(…)` |
   | a number | a finite number clamped to the range of the schema: padding, radius, font size and weight, opacity, sizes, shadow offset / blur / spread, gradient stops, grid columns 2…4, `limit`, `maxLines`, `weight` |
   | a token, role or asset name | the token pattern, so nothing outside `[a-z0-9-]` gets into a CSS variable name |
   | a font family | a name made of letters, digits, spaces and `. _ ' & + -` |
   | an alignment, `fit` or direction | one of the listed values |

   A value that does not parse behaves as the contract's compatibility policy
   says for an unknown one (the property is not applied, or the field default
   is used) and is reported. This holds for server rendering too, where a `;`
   in a style value would otherwise start a new declaration.
2. **Shadows and gradients are assembled from checked parts**, so a "colour"
   cannot add a layer or an address. `url(…)` is produced only for images the
   document may legitimately name, and a theme cannot name an address at all.
3. **Nothing is drawn or clicked outside the root element.** The root clips
   its content (`overflow: clip; contain: layout paint`): a wide node, a
   shadow, a negative margin or the 48 px press area of a button cannot cover
   your page or take a click meant for your own controls, and a descendant
   cannot become `position: fixed` relative to the window.
4. **A malformed document or theme does not take your application down.**
   - Whatever does not have the promised shape (a node that is not an object,
     `children` that is not a list, `null` where an object is expected) is
     ignored and reported.
   - A theme with holes is completed from the built-in theme of the same
     brightness.
   - If a screen still throws, the error is caught *inside* the renderer — in
     the browser and during server rendering — and replaced by a neutral
     notice (`renderError`), with a `render-error` report. The notice stays
     until `document.documentId` or `entry` changes (the same document would
     throw again); remount the component with `key` to retry.
5. **What reaches your handlers is checked.**
   - `onWrite` is never called with a path that has a `__proto__` /
     `constructor` / `prototype` segment, and only for `writablePaths` when you
     give them.
   - Action `params` are own keys with string values.
   - `source.record` is a fresh frozen map with the record's own keys of the
     data-path form only (no `__proto__`, `constructor` or `prototype`
     segment). Its values are the ones you passed in `collections` — the
     document cannot name or change them, only choose which list is shown.
6. **No lookups through the prototype chain.** Data paths, binding formats and
   every table keyed by a string from the document are read as own keys.
7. **The stylesheet matches nothing of yours.** Its selectors are scoped to the
   package's own `[data-hotlayout]` root.

### Images: https only, unless you say otherwise

An image address named by the document or by bound data is loaded only if it
is an absolute `https:` URL with a public host name: the same form as an
`openUrl` link (a letter top-level label, no credentials, no IP literal such
as `192.168.1.1`, `127.1` or `[::1]`, no `localhost`). `http:`, `data:`,
`blob:`, `javascript:`, relative addresses and anything else are drawn as the
placeholder and reported. For an address that came from your `data` the report
and the console carry the scheme and host only, never the path or the query.
Every `<img>` is drawn with `referrerPolicy="no-referrer"`, `loading="lazy"`
and `decoding="async"`; a CSS `background-image` cannot carry a referrer
policy, so the `Referrer-Policy` of your own page applies to those. To narrow that to your own hosts, to route images through your
proxy, or to allow `http://localhost` or an intranet address in development,
decide yourself (`allowedByDefault` is `false` for the addresses above):

<!-- example: security.tsx#images -->
```tsx
const IMAGE_HOSTS = new Set(['cdn.example.com', 'images.example.com'])

export function OwnImagesOnly({ layout }: { layout: UiDocument }) {
  return (
    <HotlayoutScreen
      document={layout}
      resolveImageUrl={(url, { allowedByDefault }) => {
        if (IS_DEVELOPMENT && url.startsWith('http://localhost:')) return url
        // `allowedByDefault` is true for an absolute https: address — the renderer's own rule.
        return allowedByDefault && IMAGE_HOSTS.has(new URL(url).hostname) ? url : null
      }}
      onReport={(report) => {
        if (report.kind === 'ignored-input') console.warn('layout input ignored:', report.where, report.reason)
      }}
    />
  )
}
```

Addresses you pass in `assets` are yours and are not filtered. Addresses in
your `data` and `collections` **are** — the document chooses which path an
image is bound to. If your own data carries `data:` images or site-relative
addresses (`/img/42.png`), allow exactly those in `resolveImageUrl`.

### What the package does not guarantee

- **`!important` rules of your own page** still reach inside the screen — see
  [Styles and isolation](#styles-and-isolation).
- **The content of an image** you allowed. An `https:` image is still a
  request to that host from your user's browser (IP address, time; `Referer` is not sent for `<img>`, but your page's `Referrer-Policy` applies to CSS backgrounds),
  and the picture can show anything — including text that imitates your UI
  *inside* the screen's rectangle. Use `resolveImageUrl` and CSP to decide
  which hosts are acceptable.
- **The texts and the flow of the screen.** A document says what is written on
  a button and which action it carries; treat `onAction` as a request from the
  screen, and authorise it on your backend like any other request.
- **Size.** The renderer caps list length (50 records), theme tokens and the
  depth of the tree, but does not limit the size of the document itself; the
  builder publishes documents up to 1 MB.

### Recommended Content-Security-Policy

For the page that hosts the screen:

```text
img-src 'self' https://cdn.example.com;   /* exactly the image hosts you allow */
style-src 'self' 'unsafe-inline';         /* or style-src-attr 'unsafe-inline' with injectStyles={false} */
script-src 'self';                        /* the renderer never needs inline scripts or eval */
connect-src 'self' https://storage.example.com;  /* only if you use loadDocument / loadTheme */
```

`img-src` is the second lock on what `resolveImageUrl` decides: even an address
that slipped through is not requested by the browser.

## Accessibility

Built in; nothing to configure except `labels`.

| | |
|---|---|
| **Keyboard** | Buttons, icon buttons, accordion headers and the back arrow are real `<button>`s. A list row with an action is `role="button"`, a tab stop, activated by `Enter` and `Space`. |
| **Focus ring** | Every focusable element shows a 2 px ring in the theme's `primary` colour on `:focus-visible`. Buttons and rows also get an inner ring in their own text colour, so the focus stays visible where the element touches the edge of the root (the root clips what is drawn outside it). |
| **Tabs** | WAI-ARIA Tabs with automatic activation: one tab stop per strip, `←` `→` (swapped in RTL), `Home`, `End`; `tab` ↔ `tabpanel` are linked. |
| **Modal screens** | WAI-ARIA Dialog: focus moves into the sheet and returns to what opened it, `Tab` cycles inside a layer the person can dismiss, `Esc` closes (unless the screen says `dismissible: false`), the screen underneath is `inert`. A layer that cannot be dismissed lets `Tab` leave the package, so a document can never lock a keyboard user out of your page; set `trapFocus` to keep `Tab` inside always. |
| **Screen changes** | After the user navigates, focus moves to the new screen, so the next `Tab` starts there rather than at the top of your page. The first screen never takes focus. |
| **Names** | Images use the `alt` from the document — a plain string or a string of the document (a binding, a template), translated like any text (no `alt`, or an empty one → decorative, hidden from assistive technology). Icons likewise. The back arrow is named by `labels.back` (default `"Back"`) — translate it. |
| **Icon buttons** | An `IconButton` has no visible text; its accessible name is the `label` of the node, after translation and data binding (`aria-label`). A document that left the label empty still gets a working button, named by its icon in words (`chevron-left` → "chevron left"). An icon next to the label of a `Button` or a `Badge` is decorative and hidden from assistive technology; a badge with an icon is text, not a control. |
| **Pressable cards** | A container with an action is `role="button"`, a tab stop before the controls inside it; its name is the `label` first, then the text of the content. |
| **Long press** | A node with a long press is described by the name of the action (`aria-describedby` to a hidden element) and lists its keys (`aria-keyshortcuts="ContextMenu Shift+F10"`); those keys run it at once on the focused node. |
| **Text fields** | A real `<input>` / `<textarea>` with a visible `<label for>` as its name; the helper and the error describe it (`aria-describedby`), an error sets `aria-invalid` and is announced politely. Tab order is document order. |
| **Switches and checkboxes** | A `<button>` with `role="switch"` / `role="checkbox"` and `aria-checked`, named by its label; the whole row is the target; `Space` toggles (`Enter` too for a switch). |
| **Options and toggles** | A node with `setValue` is `role="radio"` with `aria-checked` and, among the options of one parent that write the same path, `aria-posinset` / `aria-setsize`; a node with `toggleValue` is a button with `aria-pressed`. Each is a tab stop; `Enter` and `Space` press. |
| **Choice groups** | `role="radiogroup"` with `role="radio"` rows and `aria-checked`; each option is a tab stop, selected by `Space` or `Enter`. |
| **Reduced motion** | With `prefers-reduced-motion: reduce` every moving node (`motion`) stands at rest, and a node with `visibilityTransition` appears and disappears at once; the document needs no second variant. |
| **Progress** | `role="progressbar"` with `aria-valuenow` / `aria-valuemax`. |
| **Language** | The root carries `lang` and `dir`, so a screen reader switches voice for an Arabic screen on an English page. |

Colour contrast is a property of the theme, and text alternatives are written
by whoever builds the screen — the renderer cannot add what the document does
not say.

## Versions

This version reads layout documents of schema **9.33.x** and themes of theme
contract **4.0.x**, and embeds icon set 1.0.0. Any 9.x document and any 4.x
theme is drawn; React 18 and 19 are supported by every release.

The rule is the contract's (`x-compatibility` in `screen-schema.json`): the
**major must match**; a minor only adds optional things; a patch changes
nothing a reader can see.

<!-- example: versions-and-loading.tsx#version -->
```tsx
checkDocumentVersion('9.0.0') // { kind: 'compatible' }
checkDocumentVersion('9.99.0') // { kind: 'newer-minor', documentVersion: '9.99.0' } — drawn, the unknown is skipped
checkDocumentVersion('10.0.0') // { kind: 'incompatible', reason: 'major 10 is not readable by a major-9 reader', relation: 'document-newer' }
console.log(`this build reads schema ${READER_SCHEMA_VERSION}`)
```

### What the user sees

- **Same major, newer minor** — the screen is drawn. Widgets this build does
  not know draw their children, unknown tokens and fields are skipped;
  `onReport` gets `newer-minor-document`. Nothing looks broken, something new
  may be missing.
- **Another major** (newer *or* older) — the screen is **not drawn**. Drawing
  "as much as possible" of a document from another major would show a screen
  nobody designed. By default the user sees a short message
  (*"Update the app to see this screen."* for a newer major, *"This screen is
  not available right now."* otherwise; `role="alert"`); replace it with your
  own:

<!-- example: versions-and-loading.tsx#incompatible -->
```tsx
export function Guarded({ layout }: { layout: UiDocument }) {
  return (
    <HotlayoutScreen
      document={layout}
      renderIncompatible={(verdict) =>
        verdict.relation === 'document-newer' ? (
          <p role="alert">Please update the app to see this screen.</p>
        ) : (
          <p role="alert">This screen is not available right now.</p>
        )
      }
      onReport={(report) => {
        if (report.kind === 'incompatible-document') console.error('layout refused', report.documentVersion, report.readerVersion, report.reason)
      }}
    />
  )
}
```

`HotlayoutScreen` applies the rule itself. Call `checkDocumentVersion` when
you want to decide *before* rendering — typically to keep showing the previous
version of a screen instead of the refusal, as in the next section.

When the builder moves to a new schema major, update this package in your app
**before** screens are republished from the new builder.

### Which package reads which schema

| Package | Document schema |
|---|---|
| 0.30.x, 0.31.x | 9.33.x |
| 0.29.x | 9.32.x |
| 0.28.x | 9.31.x |
| 0.26.x, 0.27.x | 9.28.x |
| 0.24.x, 0.25.x | 9.27.x |
| 0.23.x | 9.25.x |
| 0.22.x | 9.24.x |
| 0.21.x | 9.23.x |
| 0.20.x | 9.21.x |
| 0.19.x | 9.20.x |
| 0.17.x, 0.18.x | 9.19.x |
| 0.15.x, 0.16.x | 9.18.x |
| 0.14.x | 9.17.x |
| 0.13.x | 9.14.x |
| 0.12.x | 9.13.x |
| 0.11.x | 9.12.x |
| 0.10.x | 9.11.x |
| 0.9.x | 9.8.x |
| 0.8.x | 9.7.x |
| 0.7.x | 9.5.x |
| 0.6.x | 9.4.x |
| 0.5.x | 9.3.x |
| 0.4.x | 9.2.x |
| 0.2.x, 0.3.x | 9.1.x |
| 0.1.x | 9.0.x |

Every row: theme contract 4.0.x, React 18 and 19. 0.17 performs half of the
9.19 additions and 0.18 all of them — the details are in the
[changelog](CHANGELOG.md).

### What each schema minor added

Every addition is an optional field: a document without it is drawn as before.
The table says where a host can read more — a section of this page when there
is something for the host to do, the [changelog](CHANGELOG.md) entry of the
package version otherwise.

| Schema | What a document can say | Read more |
|---|---|---|
| 9.1 | The device locale picks the translation | [Languages](#languages-and-right-to-left) |
| 9.2 | A list row carries its record to the screen it opens | [One screen, many records](#one-screen-many-records) |
| 9.3 | Icons from the embedded set | [Icons](#icons) |
| 9.4 | Template sentences, `number` / `currency` / `daysUntil`, plurals | [Sentences, numbers, money and plurals](#sentences-numbers-money-and-plurals) |
| 9.5 | An icon in a button and a badge, button sizes, `IconButton` | [Accessibility](#accessibility); changelog 0.7.0 |
| 9.6 | A text made of styled parts (`Text.spans`) | changelog 0.8.0 |
| 9.7 | Thickness, track, gradient and size of a progress bar and ring | changelog 0.8.0 |
| 9.8 | The action catalog, the analytics event of a press, the screen-shown event, `carryRecord` | [Actions and navigation](#actions-and-navigation) |
| 9.9 | An own image proportion, app bar actions, a modal window in the middle, the status bar request, the three zones of a screen | [Scrolling and the app bar](#scrolling-and-the-app-bar); changelog 0.10.0 |
| 9.10 | An overlay layer of a stack (`layer`) and a pulled child (`pull`) | changelog 0.10.0 |
| 9.11 | A carousel (`carousel` on a scrolling row and on a data list), a stepped progress bar (`segments`) | changelog 0.10.0 |
| 9.12 | The bottom zone: `NavBar` / `NavItem`, `pin: 'bottom'`, `navigate.section` | [The bottom zone](#the-bottom-zone-navigation-bar-and-a-pinned-block) |
| 9.13 | `TextField`, `Switch`, `Checkbox` | [Forms](#forms) |
| 9.14 | `required`, `requiresFilled` / `disabledIf` on a button, a number field | [Required fields…](#required-fields-a-disabled-button-a-number-field) |
| 9.15 | Alignment on both axes: `Column.justify`, `Container.align` / `justify`, `Screen.align` / `justify` | [below](#layout-and-text-additions-of-915917) |
| 9.16 | A node in the leading zone of an app bar, `titleAlign`, `glyphSize` | [Scrolling and the app bar](#scrolling-and-the-app-bar); [below](#layout-and-text-additions-of-915917) |
| 9.17 | Text emphasis, list items (`Text.marker`), the own style of a ring label | [below](#layout-and-text-additions-of-915917) |
| 9.18 | Width classes: `showOn`, `styleOn`, `propsOn`, `Screen.contentMaxWidth`; the navigation bar and modal sheets on a wide place | [Adaptive layout by width](#adaptive-layout-by-width) |
| 9.19 | Free composition (a container inside its own type, a tree of up to eight levels — drawn as any other tree) and pressable containers | [Pressable cards](#pressable-cards) |
| | Money: the sign of a currency, its place, the sign of the number, styled parts | [Money](#money) |
| | The body under the app bar (`bodyTop`), the top safe inset | [Safe areas](#safe-areas) |
| | Write actions `setValue` / `toggleValue` and choice from own nodes | [Write actions and choice](#write-actions-and-choice) |
| | Parts of a list row and of a text field | [below](#parts-of-a-list-row-919); [Forms](#forms) |
| | `alt` as a string of the document, an icon name from data, date parts, `unset` in a width layer | [Accessibility](#accessibility); [Data](#data); [Adaptive layout](#adaptive-layout-by-width) |
| 9.20 | Motion of a node (`motion`), blur under a modal layer, glass (`style.backdropBlur`) | changelog 0.19.0 |
| 9.21 | A number that counts to its new value (`animateChanges`), a ticking countdown (`countdownPart`), round ends of a bar and a ring (`cap`), an app bar that changes when the body scrolls (`styleScrolled`, `titleShown`) | [below](#values-countdowns-round-ends-and-the-app-bar-after-scrolling-921) |
| 9.22 | A floating navigation bar (`NavBar.float`), a dot on an item (`NavItem.badgeWhen`), drag to confirm (`Button.confirm`), a dashed border (`style.border.style`) | [below](#floating-bar-dot-drag-to-confirm-and-dashed-border-922) |
| 9.23 | A filtered list (`Repeater.where`), a comparison with another path (`valuePath`), a gradient on the letters (`style.textGradient`), compact numbers (`notation`) | [below](#filtered-lists-gradient-text-and-compact-numbers-923) |
| 9.24 | A value that grows when shown (`animateIn`), the busy state after drag to confirm and the promise of `onAction`, the motion of the dot on an item, nodes pinned to the top (`pin: "top"`) | [below](#appearing-values-busy-swipe-dot-motion-and-the-top-zone-924) |
| 9.25 | The steps of a bar that fill smoothly, the glow of a scale (`glow`), a shadow in the colour of the background (`style.shadowColor`), the press feedback of a pressable node, a haptic request (`haptic`) | [below](#live-feedback-steps-glow-shadow-colour-press-and-haptic-925) |
| 9.26 | A long press (`longPress`, `longPressLabel`), grouped lists (`Repeater.groupBy`), a sheet that follows the finger down, a modal screen that waits for an action (`dismissible: false`) | [Long press](#long-press); [below](#long-press-groups-and-sheets-926) |
| 9.27 | A page opened from a list row follows the data | [A page follows the data](#a-page-follows-the-data) |
| 9.28 | No new field: the rules of a reader the contract now states — the default picture address and its network limits, at most 2550 list instances per screen, theme numbers out of bounds, transparent text out of the name of a card, focus of a layer that cannot be dismissed | changelog 0.26.0 |
| 9.29 | No reader change: a node name for the builder's tree (`name`) is read and ignored | changelog 0.28.0 |
| 9.30 | No reader change: a write action (`setValue`, `toggleValue`) on a long press runs through the same press path as any long press action | changelog 0.28.0 |
| 9.31 | No new field: the bottom safe inset of a modal sheet goes inside the sheet box, under its content | [Safe areas](#safe-areas) |
| 9.32 | `carousel.stopPath`: the active stop of a carousel written to and read from a number data path | changelog 0.29.0 |
| 9.33 | `visibilityTransition: "fade"`: a node fades out and in when its `visibleIf` changes | changelog 0.30.0 |

#### Layout and text additions of 9.15–9.17

None of these asks anything of the host; they are listed so that you know what
you are looking at.

- **Alignment (9.15).** `justify` is the main axis; `align` of a row container
  is the vertical axis. Free space on the main axis comes only from a named
  `style.height`, `style.minHeight` or a stretched layer — a column of the
  height of its content has none, and that is not an error. `align` of a
  column container and of a screen is the rule of the column.
- **`glyphSize` (9.16).** An integer 8…128: the side of the drawing of an
  `Icon` and an `IconButton`, clamped by the named box and not multiplied by
  the system font scale.
- **Text emphasis (9.17).** `style.fontStyle` and `style.textDecoration` of a
  text are inherited field by field and read by `Text` only. A part of a text
  can name `weight`, `fontStyle` and `textDecoration`; the line is drawn by
  each run itself.
- **List items (9.17).** `Text.marker` (`bullet` / `number`) draws a column of
  the font size of the text with a hanging indent; the number counts the
  visible items of a group of neighbours.
- **The label of a ring (9.17).** `labelTypography` / `labelColor`. The label
  never scales with the ring, never inherits and never sizes it.

#### Values, countdowns, round ends and the app bar after scrolling (9.21)

All four are optional; a document without them is drawn exactly as before.

- **`animateChanges` on `Text`, `ProgressBar` and `CircularProgress`.** When the
  *data* behind a bound number change while the node is on screen, the number
  counts from the old value to the new one in 700 ms (ease-out) and ends exactly
  on the new one: whole steps when both ends are whole, the cents of the
  currency for `currency`, three digits for `number`; a bar and a ring grow
  without a step. Every number on the way is written by the same format,
  sentence and plural word as the last one. There is no transition for the
  first draw of a node (so none on the server and none while hydrating), for a
  node that appears, for a language changed in the same step, for `reduce
  motion`, for a value that is not a number on either side ("no data" to data
  included) and for the same value; a new change in the middle starts from the
  number shown at that moment. The screen reader gets the final value only:
  nothing is announced on the way. A new *document* is a first draw.
- **`format: 'countdownPart'`** — see [Sentences, numbers, money and plurals](#sentences-numbers-money-and-plurals).
- **`cap: 'round'` on `ProgressBar` and `CircularProgress`.** The ends of the
  bar track and fill are half-circles of half the thickness (the theme `pill` is
  not read); a ring arc gets half-circle ends that stay *inside* the filled
  part, a tiny share is a dot, and a full ring has no ends and no seam.
- **`styleScrolled` and `titleShown: 'scrolled'` on the app bar.** Once the body
  has scrolled under the app bar zone, the bar takes `background`, `color`,
  `shadow` and `backdropBlur` from `styleScrolled` (never its box; a token the
  theme does not know is dropped), and the title is drawn only then — at rest it
  keeps its place and its accessible name (`opacity: 0`). The screen root
  listens to the scroll of its own body passively, and only when the bar asks;
  with `scroll="page"` the scroll is how far the root top went past the line the
  bar sticks to. The editor canvas never scrolls, so it shows the bar at rest.

#### Floating bar, dot, drag to confirm and dashed border (9.22)

All four are optional; a document without them is drawn exactly as before. The
package adds **no global style** for them: everything is inline, and nothing is
added to the markup of a node except the marks named below.

- **`NavBar.float`.** With the bar in the *bottom* zone (`compact`, or
  `widePlacement: "bottom"`) the whole zone — the pinned block and the bar —
  lies over the body: it has no height in the flow (`data-hl-zone="bottom"`
  carries `data-hl-floating`), the body area runs to the bottom of the screen and
  the content scrolls under the bar. The root measures the zone and the body
  ends with its usual end *plus* that height, so the last row scrolls clear of
  the bar. The bottom safe inset (`safeAreaBottom`) is the transparent room
  *under* the box of the bar, not part of its background. The look of the
  pill — margin, radius, `backdropBlur`, shadow — is the `style` of the node;
  nothing is built in. Only the boxes of the block and of the bar catch presses;
  the rest of the zone lets them through to the body. With `scroll="page"` the
  zone sticks to the bottom of the host page over the content (no backdrop).
  At the top of a wide screen the field is not read.
- **`NavItem.badgeWhen`.** A condition of the form of `visibleIf`; while it holds
  a dot of 8 in the theme colour `accent` stands on the top corner of the icon at
  the end of the line (`data-hl-badge`, hidden from screen readers; the name of the
  item stays its label). A form the reader does not understand draws no dot.
- **`Button.confirm: "swipe"`.** The button is drawn as a track with a round
  thumb (`data-hl-confirm="swipe"`, `data-hl-swipe-thumb`). A pointer drags the
  thumb along the line; releasing it at 90% of the way or further runs the
  action, with its `track` event once before it; less, and the thumb returns.
  A press with no drag does nothing. Enter, Space and an activation from a
  screen reader run the action at once; a held key repeating is not a press.
  A disabled button does not move. Give the host nothing: it is a plain
  `<button>` with `touch-action: pan-y`.
- **`style.border.style: "dashed"`.** The border keeps its room as a transparent
  solid one and the dashes are an image over the border box (`border-image`),
  drawn once the box is measured — so the server markup has the transparent
  border and the dashes appear when the page is live. A node with a dashed border
  carries `data-hl-dashed` and is followed by one hidden element that does the
  measuring.

#### Filtered lists, gradient text and compact numbers (9.23)

All three are optional; a document without them is drawn exactly as before.

- **`Repeater.where`** keeps only the records that pass a condition of the form of
  `visibleIf`, evaluated on each record in its own scope; the condition may
  compare with the value under another path (`valuePath`), for instance a
  category chosen by a `setValue` action. A comparison with **no** operand passes
  every record, so a filter that was never set shows everything. The grid
  closes up, the carousel counts cards by the records drawn, and `limit` takes
  the first records *that passed*. The empty state of a filtered list is a
  condition `isEmpty` / `isNotEmpty` on the collection with the same `item` and
  `where`.
- **`valuePath`** is a comparison operand everywhere a condition is read
  (`visibleIf`, `styleWhen`, `disabledIf`, `badgeWhen`, the states of parts). With
  nothing under it the condition does not hold, `eq` and `neq` alike.
- **`style.textGradient`** paints the letters of a `Text` with a gradient token
  or an own gradient: one gradient over the whole content box of the text, a
  part with its own colour keeps it, and the line of an emphasis and the marker
  of a list item keep the ordinary colour (also the colour of the text when the
  gradient does not resolve). It is not inherited and other widgets do not read it.
- **`notation: "compact"`** beside `format: "number"` writes 48 200 as `48.2K`
  (`48,2 тис.` in Ukrainian): one fraction digit, half up, a closed table of
  suffixes by the first part of the language of the format — not `Intl`
  compact. A plural word agrees with the full value.

#### Appearing values, busy swipe, dot motion and the top zone (9.24)

All four are optional; a document without them is drawn exactly as before.

- **`animateIn: true`** on `Text`, `ProgressBar` and `CircularProgress`: when the node is
  shown, its numbers grow from zero to their own with the curve, duration (700 ms) and
  step of `animateChanges`. A text counts the numbers it is bound to (and the numbers of
  a template); a scale grows its value (a literal value too) while the maximum stands.
  The node is *shown* when it is drawn on a shown screen: the first screen, a screen
  pushed on top, a screen shown again by "back" or a section switch, a node that appears
  by a condition or a width class. Closing a modal layer is not a show, and a change of
  data is not a show. "Reduce motion", no number and zero give the value at once, and a
  screen reader reads the final value.
  **A screen that came from the server does not grow on its first show.** While React
  hydrates server markup the nodes keep the value the server wrote, because a drop to
  zero under the reader's eyes is worse than no motion. Everything shown after that
  (a transition, "back", a node that appears) grows. A client-only render grows from the
  first frame. The server markup is always the final value.
- **Drag to confirm stays busy.** After the thumb passes the threshold the action runs
  at once and the thumb glides to the end and stays there with a ring instead of the
  icon (`aria-busy`, no more drag, press or key). `onAction` may now return a
  `Promise`: the state lasts until it settles (fulfilled or rejected), then the thumb
  returns. Without a promise it lasts until the shown screen changes or eight seconds
  pass. An action the reader runs (`navigate…`) changes the screen at once, and `none`
  or an invalid standard action return the thumb at once. Return the promise from `onAction`:

<!-- example: actions.tsx#busy-swipe -->
```tsx
// The thumb of a drag-to-confirm button waits here: it stays busy until the promise settles.
async function redeemAndWait(action: HotlayoutAction, source: ActionSource): Promise<void> {
  const offerId = source.record?.['offer.id']
  await redeem(typeof offerId === 'string' ? offerId : action.params?.offerId)
}
```

- **The dot on a navigation item** pops in (scale 0 → 1.25 → 1 in 320 ms) and fades out
  (200 ms) when its condition *changes* on a shown screen. The first show and a screen
  shown again have no motion. The size and the name of the item never change.
- **`pin: "top"`** on the children of the root that stand in a run at the start (right
  after the app bar, or first) pins them under the app bar: they never scroll, the body
  scrolls below them. Hidden nodes take no room; the word is not read with
  `bodyTop: "screenTop"` or after a child without it. In a block without its own height
  (`scroll="page"`) the zone sticks right under the app bar by the same `chrome` switch.

#### Live feedback: steps, glow, shadow colour, press and haptic (9.25)

All five are optional; a document without the fields is drawn as before, except
the two rules that need none: the steps of a bar fill smoothly while a value
transition runs, and a pressable node gives feedback to the finger.

- **The steps of a bar fill smoothly.** At rest a step is full or empty. While the
  value of a bar with `segments` runs a transition (`animateChanges`, `animateIn`) the
  filled steps are a number with a fraction on the way from the whole steps of the old
  value to the whole steps of the new one; the step it reaches is cut at that share
  and the radius of the step stays. Both ends are pictures at rest, so nothing jumps
  when the transition ends; a change inside one step moves nothing; "reduce motion"
  shows whole steps at once. A gradient runs along the drawn fill.
- **`glow: "soft" | "strong"`** on `ProgressBar` and `CircularProgress`: a blurred copy
  of the fill paint under the scale (blur 4 and 8 px, opacity 0.55 and 0.9), without
  offset. The track does not glow. A bar with steps lights one step: the current one
  when `currentColor` paints it, otherwise the last step with any fill. The glow takes
  no room, is hidden from assistive technology, and is not clipped by the scale itself;
  an ancestor that clips (the root of the screen does) clips it, as it clips a shadow.
- **`style.shadowColor: "background"`**: every layer of `style.shadow` takes the hue of
  the node's own background (a gradient gives the stop nearest to its middle) and keeps
  its own opacity. No background, an image or an unknown colour: the shadow keeps its
  colour.
- **Press feedback.** The node that performs the press gives it: a card or a list row
  scales to 0.97, a button to 0.96, an icon button, a ghost button and a navigation item
  fade to 0.7 (80 ms down, 160 ms back with a slight overshoot). It follows the pointer,
  so even a very short tap reaches the pressed pose. The keyboard gets none; with the
  system "reduce motion" every kind only fades. `pressFeedback: "none"` on a node turns
  it off. The scale is painting only: neighbours do not move.
- **`haptic`** on an action: see [Haptic feedback](#haptic-feedback).

#### Long press, groups and sheets (9.26)

All four are optional; a document without the fields is drawn as before, except the
rule that needs none: a modal sheet follows the finger down.

- **`longPress` and `longPressLabel`**: see [Long press](#long-press).
- **`Repeater.groupBy`** with a second child as the header of a group. The first child
  is the template of a record, as always; the second is drawn before each group, in the
  scope of the **first record** of the group (a press inside the header carries that
  record). Records that follow one another with the same value under the path are one
  group — absent, `null` and `""` are one value, and `1` and `"1"` are two. The groups
  are made from the records that are drawn (after `where` and `limit`), in the order of
  the data: the renderer never sorts, so the same day after another one is a new group.
  Headers and records stand in one flow with one `gap`; a header hidden by its condition
  takes no room; a numbered item counts the records only. A list in a grid or a row is
  drawn without headers.
- **A sheet follows the finger down.** A modal screen shown as a sheet from the bottom
  is dragged down by any point of it while its body is scrolled to the top (otherwise the
  move scrolls the body back first). The drag starts after 10 px and only when it is more
  down than sideways. On release: a fling down (700 px/s) closes, a fling up returns,
  otherwise 0.3 of the height decides. It returns in 250 ms, or goes down in 200 ms and
  only then performs the same `navigate.back` as a tap on the scrim (so `onNavigate` and
  the `back` show event fire after the sheet has gone; if your `onNavigate` refuses, the
  sheet comes back). Under "reduce motion" the sheet still follows the finger and the
  return and the exit are instant. A centred window is not dragged. The renderer sets no
  `touch-action`, so the body keeps its own scrolling; a handle drawn by the document is
  an ordinary node, so the sheet cannot tell it from the rest and always lets a scrolled
  body scroll back first.
- **`dismissible: false`** on a modal screen entry: no drag, no tap on the scrim and no
  `Esc` close it. `navigate.back` from a button inside the layer does, and so does your
  own system "back". Only the word `false` locks a layer; on a page the field is not read.

#### Parts of a list row (9.19)

- the style and the states of the trailing text: `trailing.style`,
  `trailing.styleWhen`;
- a one-line caption under it: `caption`, `captionStyle`, `captionStyleWhen`;
- the colour and the tinted tile of the leading icon: `leading.color`,
  `leading.tile`;
- `titleMaxLines` / `subtitleMaxLines`.

### Icons

The package embeds icon set 1.0.0 (`READER_ICON_SET_VERSION`): 332 names,
drawings from Lucide (ISC) and ten of our own, licence texts in
`THIRD-PARTY-NOTICES.md`.

- An icon name is document data, so the renderer cannot know which names it
  will meet and carries all of them: about 60 KB of compiled JavaScript (18 KB
  gzipped) in its own module, `icon-set.js`.
- A name outside the set draws an empty box of the same size.
- The set version is independent of the schema version: a redrawn icon is a
  patch of the set.

## Placements

A *placement* is a named place of your app — `home.banner`, `promo.raffle-button`.
Your code names the place once; which published document stands there is decided
in the HotLayout admin (*Placements*) and can be changed without a release. The
decision lives in one small file per project, `placements/published.json`, next
to `theme/published.json`, readable without a token.

<!-- example: placements.tsx#placement -->
```tsx
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
```

`<HotlayoutPlacement>` takes `name`, `mapUrl` and `documentUrl` (how to turn a
document id into its address — the id is always a safe path segment), and every
prop of `<HotlayoutScreen>` except `document` and `entry` (theme, data, locale,
actions…). `usePlacement(name, options)` is the same without the drawing:

<!-- example: placements.tsx#hook -->
```tsx
export function PromoButton() {
  const placement = usePlacement('promo.raffle-button', { ...placements, lastKnown: false })
  if (placement.status !== 'document') return null
  // `placement.document` and `placement.entry` go to <HotlayoutScreen> as they are.
  return <p>{placement.document.documentId} starts at {placement.entry ?? 'its first screen'}</p>
}
```

`placement.status` is `loading` (also all a server render sees), `document`
(`document`, `documentId`, `entry` — the entry point to start from, or `null` for
the first screen) or `nothing` (`report` says why).

**What a placement draws, and what you are told.** Nothing is drawn when the place
is `empty` (declared in the admin, no document), `unknown` (the map has no such
name: usually a typo), `unreadable` (the map or this entry of it cannot be read),
`documentMissing` (the document was unpublished) or `documentUnreadable` (no
network, not a document, a schema major this build cannot read). `entryMissing`
is different: the document IS drawn, from its first screen, because the entry
point the admin named is gone — someone has to fix the setup.

`onPlacementStatus({ name, status, report, mapStatus, documentId, entry })` is
called on the first answer and on every change of any of these fields — including
the way back: a document drawn again arrives as `status: 'document'` with
`report: null`, so a frame you collapsed can open again. A refresh that changes
nothing calls nothing; new content of the same document is not a change.

**Scheduled content.** A place can carry a schedule: documents that stand there for a
window of time, set in the admin. Nothing changes in your code — the placement looks
at the clock of the device itself and switches on time, with no network. A window is
`[from, until)` (`from` included, `until` excluded, UTC instants such as
`2026-11-27T22:00:00Z`); outside every window the place shows its permanent content.
A window with no document is a *pause*: the place is `empty` for that time (collapse
your frame as you do for any `empty`), then the permanent content returns. When windows
overlap, the one that started later wins. A broken window is skipped, and the place does
not become `unreadable` because of it. A timer is set for the next boundary (cut to the
longest a timer can hold and counted again at its end), and the placement decides again
on every new read of the map and when the page becomes visible again, because the clock
may have jumped. A change arrives through `onPlacementStatus` like any other, and the
map is not read again for it. The `clock` option is the clock to use, in milliseconds
since the epoch; the default is `Date.now`.

<!-- example: placements.tsx#schedule -->
```tsx
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
```

**Where the map comes from.** The network first; if it gives nothing, the last
good map this device saw (`lastKnown`, default `localStorage`; pass `false` to
keep nothing, or `{ read, write }` for your own storage), then the copy you ship
(`bundledMap`, the text of the file). `mapStatus` says which case it was:
`fresh`, `offline` (no answer, a redirect, or no complete answer within 20 s),
`corrupt` (not JSON, not UTF-8, more than 262 144 bytes or more than 32 nested
levels; one leading byte order mark is fine), `unsupported` (another major
version), `notPublished` (the project has no map yet — every name is then
`unknown`). Your own `lastKnown` store gets the map address as a key
(`read(key)`, `write(text, key)`): keep the maps of different projects apart. Only a fresh, readable map from the network becomes the last known
one. A place missing from a fresh map is `unknown`, never taken from an older
copy: a place removed in the admin must disappear from the phones.

The map is re-read on mount, when the tab becomes visible again
(`refreshOnVisible`, default on) and, if you set it, every `pollIntervalMs` (kept
within 5000 … 2147483647; a value that is not a finite number means no polling).
A newer read cancels an older one, and a new `name` or `mapUrl` starts again from
`loading`. Redirects are not followed, and the map and the document each have 20 s
from the start of the request to the end of the body. The browser revalidates the file with its ETag by itself, and the
package sends no custom headers, for the reason given in
[Updating a screen without a release](#updating-a-screen-without-a-release). To
get documents from your own client or cache pass `loadDocument(documentId,
signal)`; reject with a `HotlayoutLoadError` of status 404 for a document that is
gone (and drop it from your cache). The same deadline applies, and a value that is
not a document is `documentUnreadable`. `fetch` replaces the global `fetch` for the map and the default document
loader.

The file is untrusted input, like a document. Names are looked up among the
file's own keys only (`constructor` is a place only if the map lists it,
`__proto__` never is); a `documentId` that is not a plain path segment makes
just its own place `unreadable` and never reaches `documentUrl`.

## Updating a screen without a release

This is the point of server-driven UI: the manager presses *Publish*, and the
screen in your app changes — no build, no deploy. The published document and
theme are static JSON files at stable URLs; the app re-reads them.

<!-- example: versions-and-loading.tsx#live-document -->
```tsx
/** The published layout, re-read whenever the user comes back to the tab. */
export function useLayout(url: string): UiDocument | undefined {
  const [layout, setLayout] = useState<UiDocument>()
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      loadDocument(url, { bypassCache: true, signal: controller.signal })
        .then((next) => {
          // A layout this build cannot read does not replace the one on screen.
          if (checkDocumentVersion(next.schemaVersion).kind !== 'incompatible') setLayout(next)
        })
        .catch(() => undefined) // offline or a bad deploy: keep showing what we have
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url])
  return layout
}

export function LiveRewards({ url, theme }: { url: string; theme: ThemeContract }) {
  const layout = useLayout(url)
  return layout === undefined ? <p>Loading…</p> : <HotlayoutScreen document={layout} theme={theme} />
}
```

- **A new version of the same document keeps the user where they are.** The
  screen stack is tied to `documentId`, so replacing the object re-draws the
  current screen with the new layout. (If that screen is no longer in the
  document, the user lands on the nearest earlier screen of the flow, or at
  its start.)
- **`loadDocument` / `loadTheme` send no custom request headers**, on purpose.
  A header such as `Cache-Control` makes the request a preflighted one, and a
  storage bucket that does not allow it answers with what looks like a network
  failure (`TypeError: Failed to fetch`). `bypassCache` therefore changes the
  URL, not the headers.
- **CORS.** In a browser the bucket must allow your origin for `GET`. If
  `curl` gets 200 for a URL and the browser gets *Failed to fetch*, that is
  CORS — the error message of `HotlayoutLoadError` says so.
- **The loaders check the kind of the file, not its content.** `loadDocument`
  rejects with `HotlayoutLoadError` when the answer is not JSON (a server that
  gives an HTML page with status 200 for an unknown path is the usual case —
  the message names the content type), not a JSON object, or an object without
  `schemaVersion` and `screens`; `loadTheme` does the same for
  `themeContractVersion` and `themes`. A theme at the document's address, or
  the other way round, is named as such in the message. Nothing else is
  validated: versions and shapes are the renderer's business. Handle the
  rejection — a loader that only stores the result leaves "Loading…" on the
  screen forever when the address is wrong.
- The loaders are optional conveniences. Any way of getting the JSON works:
  your own API, a server component, a bundled file as the offline fallback.

## Limitations

**What the package does not do**

- **No schema validation.** The builder validates on publish, and the renderer
  parses every value it turns into CSS or hands to you
  ([Security model](#security-model)) — but it does not tell you that a
  document is *invalid*. If you accept documents from elsewhere, validate them
  with `screen-schema.json` and any JSON Schema validator at your boundary.
- **No data fetching, no cache.** `data` and `collections` are yours.
- **No animation.** The contract says *what* to show; screens appear without
  transitions, and motion is up to the host.
- **No scroll management.** The renderer neither scrolls your page on a screen
  change nor restores positions on "back".
- **Fonts and real asset files are not shipped** — see [Fonts](#fonts) and the
  `assets` prop. The icon set is the contract's, and the whole of it is
  embedded (see [Icons](#icons)).

**Data and formats**

- **Navigation params are not screen data.** `action.params` are handed to
  `onNavigate` / `onAction`, not read by bindings. A screen gets its record
  from the list row that opened it — see
  [One screen, many records](#one-screen-many-records) — and a screen opened
  through `entry` gets none: put the record into `data`.
- **Only a countdown ticks.** "Days left" (`daysUntil`) is counted when the
  screen is rendered, from `now`; nothing re-renders it at midnight. Hours,
  minutes and seconds until an event are `countdownPart`, and a screen that
  shows one redraws itself (unless you pass `now`).
- **Currency is written with its code**, after the amount (`120 JOD`), in every
  language, unless the binding names `currencyDisplay: 'symbol'` and / or
  `currencyPosition: 'before'`; a code the closed table of signs does not have
  stays a code. Percent and compact notation (`1.2K`) are not formats either —
  a percent is written with a template, `{percent}%`.
- **Arabic digits depend on the locale you pass.** Digits and separators come
  from the platform's CLDR data: `ar-EG` writes Arabic-Indic digits, plain `ar`
  writes Latin ones in current browsers.

**State and interaction**

- **Carousel state is the renderer's.** Which card is open is not in the
  document; it is kept while the screen is in the stack. The host is told the
  stop only when the carousel names a number path (`carousel.stopPath`): the
  stop number is then written with the same `onWrite` as an input field after
  a person's swipe settles, and the carousel follows that value. The
  renderer starts animated scrolling only to follow a changed value, and not
  under "reduce motion".
- **Local UI state is not persisted.** The open tab, expanded accordions and
  unbound choices reset when the screen is left.
- **Choice groups and options built from own nodes have no arrow-key
  navigation**; each option is a tab stop. A radio group has no accessible
  name of its own (the contract has no field for one).

**Look and placement**

- **Modal screens are bottom sheets or windows** (`modalPlacement`) of content
  height, inside the root element — not a browser-level `<dialog>`, and not
  full-viewport unless the root is (with `scroll="page"` they live in the part of
  the root visible in the window). A layer has no built-in look: its
  background, radius and shadow are the `style` of the screen root.
- **Buttons are as big as the contract says, not bigger.** A small button is
  28 px high and a small icon button 28 × 28 under the built-in theme. The
  renderer adds no minimum size; the *touch target* is an invisible 48 px area
  around the button that does not take part in layout — leave room around
  small buttons you place next to your own controls.
- **Host `!important` rules get through** — see
  [Styles and isolation](#styles-and-isolation).
- **Browsers:** current evergreen browsers (CSS logical properties, `:is()`,
  `aspect-ratio`, `inert`, `Intl.Locale`). No Internet Explorer.

The rules the renderer follows are those of the HotLayout contract; the sections
above state the ones a host meets. Changes between versions: [CHANGELOG.md](CHANGELOG.md).

## Learn more

- Website: [hotlayout.com](https://hotlayout.com)
- Documentation: [hotlayout.com/docs](https://hotlayout.com/docs), including the [quickstart for this platform](https://hotlayout.com/docs/integrator/quickstart-react)
- Video quickstart: [YouTube](https://youtu.be/YVLhz5-z_bs)
- Getting the builder: screens are made in the HotLayout builder, hosted at hotlayout.com or self-hosted. To get access, use "Get access" on [hotlayout.com](https://hotlayout.com) or write to [contact@hotlayout.com](mailto:contact@hotlayout.com).

## License

Apache-2.0 — see [LICENSE](LICENSE).
