# @hotlayout/react

React renderer for [HotLayout](https://hotlayout.com) layout documents — screens
that a manager assembles in the HotLayout builder and your app draws without a
release.

The document is plain JSON. The same JSON is drawn by the Flutter renderer in a
mobile app and by this package on the web; the contract between them
(`screen-schema.json`, `theme.json`) is the single source of truth, so the
renderer never invents anything: spacing, colours and typography come from the
theme, layout rules come from the contract.

- **reads** schema **9.19.x** documents. All six themes of that minor are performed — (1) the pressable container: `action` and `label` on `Column`, `Row`, `Container`, `Stack` make the box a button (`role="button"`, in the order of focus before the controls inside it, Enter and Space press it, the auto-repeat of a held key does not), the action is the very action of a `Button` (analytics first, then the action, the record of the list row), a press goes to the innermost control under the point and its ancestors get nothing, the name is the `label` first and then the text of the content; a type in its own type and a tree of up to eight levels are drawn as any other tree; (2) money as money: `currencyDisplay: 'symbol'`, `currencyPosition: 'before'` and `sign: 'always'` on a binding write «+42 000,50 ₴» (the minus is U+2212, zero has no sign, the composed form is wrapped in U+2066 … U+2069 in text shown right to left), and `Text.spans[place].parts` (`fraction`, `currency`) gives the decimal part and the currency a style of their own; (3) the top of the screen: `Screen.props.bodyTop: 'screenTop'` puts the body under the app bar (the bar stands over it, takes the presses of its box, the content shows through it) and the prop `safeAreaTop` adds the top inset; (4) write actions and choice from own nodes: `setValue` puts a literal (a string, a flag or a number, by `valueType`) under a path of the data dictionary and `toggleValue` flips the flag under it — with the very write an input field makes (into the session of the reader and to `onWrite` at the same moment, through `writablePaths`), after the analytics event of the action, and **never through `onAction`**; the path and the value are literals of the document (`paramBindings` are not read), the same value is not written twice, an invalid action writes nothing and is reported as `ignored-input`; on the finished screen such a node is not a plain button but an option (`role="radio"`, `aria-checked`, `aria-posinset` / `aria-setsize` among the options of one parent that write the same path) or a toggle (`aria-pressed`), recomputed from the data on every change, with the look of «chosen» coming from the `styleWhen` of the node — see [Write actions and choice](#write-actions-and-choice); (5) the parts of a list row and of a text field: the style and the states of the trailing text (`trailing.style`, `styleWhen`), a one-line caption under it (`caption`, `captionStyle`, `captionStyleWhen`), the colour and the tinted tile of the leading icon (`leading.color`, `leading.tile`), `titleMaxLines` / `subtitleMaxLines`; for a text field the look of the box itself (`fieldRadius`, `fieldBackground`, `fieldBorderColor`, `fieldBorderWidth`, `fieldHeight` — not read by a multi-line field), a mark at the start and at the end of the box (`prefix` / `suffix`: up to eight code points of text or an icon, never the value, a press on it focuses the field) and a character counter (`counter`, in code points, only with `maxLength`; read with the field, not announced on every key); (6) `alt` of an image or an icon as a string of the document (translated under the key of the field, from data or from a template; an empty one makes the picture decorative), an icon name from data (`iconPath`: from data comes only a name of the embedded set — anything else is an empty box — and the mirroring in a right-to-left screen follows the resolved name), date parts (`dateParts`: `dayMonth`, `weekdayDayMonth`, `dayMonthYear` beside `format: 'date'`) and the explicit `unset` of a field in a width layer (`styleOn.unset`, `propsOn.unset`). Every field of the 9.19 themes is optional: a document without them is drawn as before. Everything up to 9.18 is read in full (the action catalog, the analytics event of a press, the screen-shown event and `carryRecord` of 9.8 included — see [Actions and navigation](#actions-and-navigation); the additions of 9.9 — an own image proportion, app bar actions, a window in the middle, the status bar request, the three zones of a screen — of 9.10 — an overlay layer of a stack (`layer`) and a pulled child (`pull`) — of 9.11 — a carousel (`carousel` on a scrolling row and on a data list) and a stepped progress bar (`segments`) — and of 9.12 — the bottom zone of a screen: a navigation bar (`NavBar` / `NavItem`), a block pinned to the bottom (`pin: 'bottom'`) and the action `navigate.section` — are drawn too; see the changelog) and theme contract **4.0.x** (any 9.x / 4.x is drawn — see [Versions](#versions));
- of schema 9.14: a required field (`required`: an asterisk after the label, `aria-required`), a button that waits for a filled form or an unmet condition (`requiresFilled`, `disabledIf`) and a number field (`TextField.valueType: 'number'`) — see [Forms](#forms);
- of schema 9.15 (alignment on both axes: `Column.justify`, `Container.align` / `justify`, `Screen.align` / `justify`): `justify` is the main axis and `align` of a row container is the vertical axis — both are words on the flex of the host, and the free space comes from a named `style.height`, `style.minHeight` or a stretched layer (a column of the height of its content has none); `align` of a column container and of a screen is the rule of the column;
- of schema 9.16 (an app bar assembled from a mock-up, own drawing size): a child of an app bar with `zone: 'leading'` (a button or an icon button) stands in the leading zone **instead of** the back arrow whatever `showBack` says (a node hidden by its condition gives the zone back to `showBack`) and is not counted among the two actions; its width is at most half of the bar; `AppBar.titleAlign: 'start'` puts the title right after the leading zone; `glyphSize` (an integer 8…128) is the side of the drawing of an `Icon` and an `IconButton`, clamped by the named box and not multiplied by the system font scale;
- of schema 9.17 (text emphasis, list items, the own style of a ring label): `style.fontStyle` and `style.textDecoration` of a text (inherited field by field, read by `Text` only), `weight` / `fontStyle` / `textDecoration` of a part of a text (the line is drawn by each run itself), `Text.marker` (`bullet` / `number`, a column of the font size of the text with a hanging indent; the number counts visible items of a group of neighbours) and `labelTypography` / `labelColor` of a ring (the label never scales with the ring, never inherits and never sizes it);
- of schema 9.18 (adaptive layout by width): a width class (`compact` / `medium` / `expanded`) measured from the root element, `showOn`, `styleOn`, `propsOn` and `Screen.contentMaxWidth`, and — on a wide place — the navigation bar at the top (in the app bar or as a bar of its own) and a modal sheet drawn as a window in the middle — see [Adaptive layout by width](#adaptive-layout-by-width);
- ESM, typed, no runtime dependencies besides `react` / `react-dom` (18 or 19);
- no network, no globals, no `window` access on import — server rendering and Next.js App Router work out of the box;
- left-to-right and right-to-left scripts;
- keyboard and screen-reader support built in;
- the document and the theme are treated as **untrusted input** — see [Security model](#security-model).

```sh
npm install @hotlayout/react
```

React 18.2 or 19 is a peer dependency; the package has no other dependencies.

**Contents:** [Quick start](#quick-start) · [Props](#api) · [Actions and navigation](#actions-and-navigation) · [Data](#data) · [Forms](#forms) · [Theme](#theme) · [Fonts](#fonts) · [Languages and RTL](#languages-and-right-to-left) · [Server rendering and Next.js](#server-rendering-and-nextjs) · [Styles and isolation](#styles-and-isolation) · [Security model](#security-model) · [Accessibility](#accessibility) · [Versions](#versions) · [Updating a screen without a release](#updating-a-screen-without-a-release) · [Limitations](#limitations)

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
data, and tell it what your app does with actions. Where the two JSON files
come from is up to you — bundle them, fetch them on the server, or
[load them by URL](#updating-a-screen-without-a-release) so that a republished
screen reaches users without a deploy.

**Where the three inputs come from:**

| Input | Where to get it |
|---|---|
| `document` | The published layout of one document — a static JSON file, readable without a token: `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/orgs%2F<orgId>%2Fprojects%2F<projectId>%2Fdocuments%2F<documentId>%2Fpublished.json?alt=media` (the object path `orgs/{orgId}/projects/{projectId}/documents/{documentId}/published.json`, URL-encoded). The project settings in the HotLayout admin (*Delivery*) show this address as a template with your bucket and ids filled in. If the project delivers by **webhook**, your backend receives the same JSON on every publish and serves it from wherever you like. |
| `theme` | The published theme of the project — one file for all its documents, at the same place: `…/o/orgs%2F<orgId>%2Fprojects%2F<projectId>%2Ftheme%2Fpublished.json?alt=media`. |
| keys of `data` and `collections` | The project's **data dictionary**: the *Data dictionary* section of the project in the admin, where it can be downloaded as `data-contract.json` (the webhook body carries the same list as `dataContract`). `paths` are the keys of `data` (`user.firstName`); `collections[].path` are the keys of `collections` (`items`), and `collections[].item` is the prefix of the record fields inside a list (`item.name` → the `name` field of a record). |

The examples call the variable `layout`, not `document`: inside a component
`document` would shadow the browser's own `document`.

Give the root a height (`style={{ minBlockSize: '100dvh' }}`): the root is a
flex column that takes the size you give it, the screen background reaches its
bottom, and modal sheets sit on the bottom edge of its area (with
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
| **Touch targets** | Buttons look exactly as designed (a button with `sm` padding is 40 px tall) but are *pressable* in an area of at least 48 × 48 px, without shifting neighbours. |

## API

### `<HotlayoutScreen>`

| Prop | Type | |
|---|---|---|
| `document` | `UiDocument` | **Required.** The layout document. Not validated against the schema — the builder did that — but never trusted either. |
| `theme` | `ThemeContract` | `{ themeContractVersion, defaultThemeId, themes }` — a project's `theme/published.json`. Omit to use the built-in starter theme. |
| `themeId` | `string` | Which theme of the set to use, e.g. `'dark'`. Unknown id → the set's default. |
| `data` | `Record<string, unknown>` | Values for bindings, as a **flat** map keyed by data-contract path: `{ 'user.points': 1250 }`. A screen opened from a list row reads that row's record first. |
| `collections` | `Record<string, object[]>` | Lists for `Repeater` widgets, keyed by collection name. |
| `locale` | `string` | The user's locale as the platform gives it (`ar-EG`, `pt_BR`). The renderer finds the document's translation by dropping subtags from the end (`ar-EG` → `ar`), and takes date formats and (unless `dir` is set) direction from the result. No match → the document's own language. See [Languages](#languages-and-right-to-left). |
| `timeZone` | `string` | IANA zone the bound dates are written in. Defaults to the zone of whoever renders. **Set it when you render on a server** — see [Server rendering](#server-rendering-and-nextjs). |
| `now` | `number \| Date` | The moment the screen is rendered at (epoch milliseconds or a `Date`). The `daysUntil` format counts whole days from it. Defaults to the clock of whoever renders, read on every render. **Set it when you render on a server**, and in tests and previews — see [Sentences, numbers and plurals](#sentences-numbers-and-plurals). |
| `dir` | `'ltr' \| 'rtl'` | Overrides the direction derived from `locale`. |
| `entry` | `string` | Public entry-point name. Unknown name → the initial screen. Changing `entry` restarts the stack. |
| `assets` | `Record<string, string>` | URLs for asset tokens (`logo`, `banner`, …). A token without a URL is drawn as a placeholder. |
| `labels` | `{ back?: string }` | Texts that belong to the renderer: the accessible name of the back arrow. Translate it with your UI. |
| `onAction` | `(action, source) => void` | Actions the renderer does not perform itself; `openUrl`, `deeplink` and `close` arrive with a verdict (`standard` or `invalid`) — see [Actions and navigation](#actions-and-navigation). `source` is `{ nodeId, screenId, record? }`; `record` is the list row (or the record of the screen) the action is about — see [One screen, many records](#one-screen-many-records). |
| `onTrack` | `(event, source) => void` | The analytics event of a press (`action.track`: `{ event, params? }`): once per press, **before** anything else — before the renderer navigates (also when `onNavigate` then cancels), before `onAction`, and for `none` too. The handed action does not carry it. See [Actions and navigation](#actions-and-navigation). |
| `onNavigate` | `(event) => boolean \| undefined` | Called **before** the renderer changes screens. Return `false` to cancel and navigate yourself (e.g. with your router). |
| `onScreenChange` | `(screen) => void` | The screen-shown event: once per show of a screen, the first one included. `screen` is `{ screenId, name, presentation, documentId, entry, cause, depth, record }` — see [Screen shown](#screen-shown). |
| `onWrite` | `(path, value: string \| boolean \| number) => void` | The user changed a data-bound input: a `ChoiceGroup` (a string), a `TextField` (a string on every change; a number field writes a **number**, or `""` when the text is not a number), or a `Switch` / `Checkbox` (a boolean). **The path is named by the document** — see [Writes](#writes-the-document-names-the-path). |
| `writablePaths` | `string[] \| (path) => boolean` | The data paths the document may write to. With it, `onWrite` is called for these paths only; without it, for any path of the dictionary form. |
| `autofill` | `boolean` | Whether text fields may ask the browser for autofill hints (`email`, `tel`, `url`, taken from the field's keyboard). Default `true`; `false` sets `autocomplete="off"` on every field. See [Forms](#forms). |
| `resolveImageUrl` | `(url, context) => string \| null` | Your decision about every image address named by the document or by bound data. Default: absolute `https:` only. See [Images](#images-https-only-unless-you-say-otherwise). |
| `onReport` | `(report) => void` | Fallbacks and refusals: `incompatible-document`, `newer-minor-document`, `theme-fallback`, `unknown-theme-id`, `invalid-theme-values`, `unknown-entry`, `no-screen`, `ignored-input`, `render-error`. Without a handler they go to `console.warn` — no fallback is silent. |
| `renderIncompatible` | `(verdict, version) => ReactNode` | What to show instead of a document of an incompatible major. Default: a short `role="alert"` message. |
| `renderError` | `({ screenId, message }) => ReactNode` | What to show instead of a screen that threw while rendering. Default: *"This screen is not available right now."* The error never reaches your application — see [Security model](#security-model). |
| `injectStyles` | `boolean` | Render the package stylesheet next to the screen. Default `true`. |
| `scroll` | `'page' \| 'screen'` | Who scrolls. A screen has three zones — the app bar **stands**, only the body scrolls, the background does not move. `'page'` (default): the block has no height of its own, it grows with its content and your **page** scrolls (see `chrome`). `'screen'`: you gave the block a height (`100dvh`, a fixed height, a flex remainder) — the root fills it and the zones work literally, the body scrolls inside the block. See [Scrolling and the app bar](#scrolling-and-the-app-bar). |
| `chrome` | `'sticky' \| 'static'` | Only with `scroll="page"`. `'sticky'` (default): the app bar sticks to the top of the viewport while the screen is in view; it paints the background of the screen root under itself. `'static'`: it stays the top row of the block and scrolls with the page (your site already has its own fixed header). |
| `stickyOffset` | `number \| string` | Only with `scroll="page"` and `chrome="sticky"`: the `top` the app bar sticks at when your site has a fixed header above the block. A number is CSS pixels; a string is a length (`'56px'`, `'3.5rem'`) or a CSS variable of yours (`'var(--site-header-height)'`). Anything else is ignored. |
| `safeAreaBottom` | `number \| 'env'` | The bottom safe-area inset the reader adds **under** the content of the bottom zone (a pinned block, a navigation bar) — and only when the screen has such a zone; the background of the bar reaches the physical bottom. `'env'` (default) is `env(safe-area-inset-bottom)` of the browser; a number is CSS pixels you measured yourself (`0` turns it off when your host already leaves room for the home indicator); anything else counts as `0`. With `scroll="page"` it is added only while the zone sticks. See [The bottom zone](#the-bottom-zone-navigation-bar-and-a-pinned-block). |
| `safeAreaTop` | `number \| 'env'` | The top safe-area inset the reader adds **inside the box of the app bar, above its content** (so a named background of the bar covers the status bar); without an app bar, or with one hidden, above the body area. `'env'` (default) — `env(safe-area-inset-top)`; a number — CSS pixels you measured (`0` turns it off, when your host already wraps the reader in a safe area). Anything else, a negative number and `NaN` count as `0`. Added only with `scroll="screen"`, or while the app bar sticks to the top of the window (`scroll="page"`, `chrome="sticky"`), and never inside a modal layer; a screen with `bodyTop: 'screenTop'` adds nothing to the content of its body. |
| `stickyBottomOffset` | `number \| string` | Only with `scroll="page"` and `chrome="sticky"`: the `bottom` the bottom zone sticks at when your site has a fixed bar below the block. Same forms as `stickyOffset`. |
| `initialWidthClass` | `'compact' \| 'medium' \| 'expanded'` | The width class to draw until the root element has been measured (default `'compact'`). Pass it when you know the width of the place — then the server markup and the first browser frame already have the final layout. After the first layout the measured class wins. Anything else counts as `'compact'`. See [Adaptive layout by width](#adaptive-layout-by-width). |
| `className`, `style` | | Applied to the root element. Use them to size and place the screen. |

The stack is tied to `document.documentId` and `entry`, not to object identity:
re-parsing the same published file on every render does not throw the user
back to the first screen.

### Other exports

| Export | |
|---|---|
| `checkDocumentVersion(version)` | The contract's version rule as a plain function — see [Versions](#versions). |
| `loadDocument(url, options?)`, `loadTheme(url, options?)` | Fetch a published file — see [Updating a screen without a release](#updating-a-screen-without-a-release). Errors are `HotlayoutLoadError` with `url` and `status`. |
| `runStandardAction(action, handlers)` | The optional helper that performs `openUrl`, `deeplink` and `close` — only those that passed the check, only with the handlers and app-link schemes you give it. Returns `true` when it did. See [Actions and navigation](#actions-and-navigation). |
| `openInNewTab(url)` | A ready `openUrl` handler: `window.open(url, '_blank', 'noopener,noreferrer')`. The renderer never calls it; you pass it to `runStandardAction`. |
| `paramFormProblem(form, value)`, `ACTION_CATALOG` | The contract's check of an action parameter and the catalog of named actions — plain data and a plain function, no React, usable on the server. |
| `resolveTheme(contract, themeId?)` | The theme the renderer would draw with, plus the fallbacks it took. |
| `resolveLocale(requested, available, source)` | Which language a document is shown in for a given user locale — the renderer's own rule, for the parts of your UI that must speak the same language as the screen. See [Languages](#languages-and-right-to-left). |
| `BUILT_IN_THEME_CONTRACT` | The built-in light and dark themes. |
| `HOTLAYOUT_CSS` | The stylesheet as a string (also shipped as `@hotlayout/react/styles.css`). |
| `READER_SCHEMA_VERSION`, `READER_THEME_VERSION` | What this build understands. |
| Types | `UiDocument`, `UiNode`, `ScreenEntry`, `ThemeContract`, `Theme`, `HotlayoutScreenProps`, `HotlayoutAction`, `StandardAction`, `InvalidActionParam`, `TrackEvent`, `ActionSource`, `NavigationEvent`, `ScreenInfo`, `ScreenShown`, `HotlayoutReport`, `VersionVerdict`, `DataScope`, `Collections`, `LoadOptions`, `LocaleResolution`, `ResolveImageUrl`, `ImageUrlContext`, … |

Anything not listed here is internal and may change in a minor release.

## Actions and navigation

A button, a list row or the back arrow carries an **action**:
`{ type: string, params?: Record<string, string> }`. The renderer performs
exactly three of them itself — `navigate` to a screen of the same document,
`navigate.back` and `navigate.section` (a section of the bottom navigation bar) —
and ignores `none`. Everything else is yours and arrives in
`onAction` with the `type` exactly as written in the document and `params` as
a plain map of strings (a parameter that is not a string, and a key such as
`__proto__` or `constructor`, is dropped and reported).

Since schema 9.8 the contract names seven actions (`navigate.section` joined in 9.12) and says who performs each:

| `type` | Performed by | Parameters |
|---|---|---|
| `none` | the renderer — does nothing, never reaches you | — |
| `navigate` | the renderer; to a screen the document does not have — you | `screenId` |
| `navigate.back` | the renderer; on the first screen — you | — |
| `navigate.section` | the renderer; to a screen the document does not have — you | `screenId` |
| `openUrl` | **you** | `url` — an `https://` address |
| `deeplink` | **you** | `url` — an app link (`myapp://offers/42`) |
| `close` | **you** — the renderer does not touch the screen stack | — |

For `openUrl`, `deeplink` and `close` the action you receive carries a
**verdict** on its parameters: `action.standard` (`{ type: 'openUrl', url }`,
`{ type: 'deeplink', url, scheme }` or `{ type: 'close' }`) when they passed the
check of the contract, or `action.invalid` (`{ param, problem }`) when one did
not. Never both; your own actions have neither. A parameter may come from the
data (`paramBindings`): it is read from the data of the node at the moment of
the press, and an address that does not pass the check is **not** replaced by
the literal fallback — the action is `invalid`.

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
- The contents of a `deeplink` are untrusted text. A key held down is one press
  (the auto-repeat is ignored), but a double click is two actions: protect a
  payment on your side.
- A package older than 0.9 receives `openUrl` and `deeplink` of a 9.8 document as
  an unknown action with raw `params` and no verdict. If you already had your own
  `openUrl` branch, update the package before managers start using the catalog.

### Analytics: what was pressed, what was shown

An action may carry `track` — `{ event, params? }`, a name of letters, digits
and underscores (at most 40) and flat string parameters. It arrives in
`onTrack`, **once per press and before anything else**: before the renderer
navigates (even when your `onNavigate` then cancels the step), before
`onAction`, and for `none` too — a button that only measures. The action you get
in `onAction` does not carry it. The renderer sends nothing anywhere itself.

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

### Screen shown

`onScreenChange` is the screen-shown event. The shown screen is the top of the
stack, and the event happens once whenever the top became another frame:

| `cause` | When |
|---|---|
| `entry` | the first screen; also after you changed `entry` or the document (the stack is built again) |
| `forward` | `navigate` put a screen on top — a modal sheet too |
| `back` | `navigate.back` (or closing a sheet) removed the top: the screen under it is shown again |
| `switch` | `navigate.section` made the named screen the **only** one in the stack (`depth` is 1, `record` is `null`); pressing the item of the screen that is already shown sends nothing |

The fields: `screenId`, `name`, `presentation`, `documentId`, `entry` (the name you
passed, only if the document has it as an entry point; otherwise `null`),
`cause`, `depth` (the stack length after the change; the first screen is 1) and
`record` (the record the screen was opened with, a flat map of paths, or
`null`). Two more fields exist **only when the screen named them** (schema 9.9):
`modalPlacement` (`'bottom'` or `'center'` — where a modal layer lies; a sheet
is the default, so a modal screen that did not name it has no key) and
`statusBarIcons` (`'light'` or `'dark'` — a **request** for the icons of the
system status bar: the reader never touches the status bar, whether to honour
it is yours). A word the reader does not know is not handed over. There is no
"hidden" event. It is **not** fired on a re-render, new data
or locale, a new object of the same document, an action handed to you
(`openUrl`, `close`, "back" on the first screen) or a navigation that did not
happen (the screen is missing, your `onNavigate` cancelled it). On the server
nothing is fired; hydration fires the first one. In React `StrictMode` it is
still one.

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

### Scrolling and the app bar

A screen has three zones (schema 9.9, `x-style.layout.screen`): the **app bar**
(the first child of the screen root, when it is an `AppBar`), the **body**
(everything else) and the bottom zone (9.12, see [The bottom zone](#the-bottom-zone-navigation-bar-and-a-pinned-block)). The app bar stands; only the body
scrolls, and only vertically; the background of the root lies under all zones
and does not move. Padding of the root is shared: the app bar gets the top and
the sides, the body gets the sides, the bottom and — instead of the top — the
screen's `gap`.

Who scrolls is **your** decision, not the document's:

- `scroll="page"` (default) — the block grows with its content and your page
  scrolls. The app bar **sticks** to the top of the viewport (`chrome="sticky"`,
  default) and paints the background of the screen root under itself, so the
  content travelling beneath never shows through; give `stickyOffset` when your
  own header is fixed above the block, or use `chrome="static"` to let the app
  bar scroll away with the page.
- `scroll="screen"` — give the block a height (for example `style={{ height: '100dvh' }}`
  on the component) and the zones work literally.

A modal layer lies over the **whole** page under it, the app bar included (every
layer of the stack is its own stacking context). With `scroll="screen"` its area is
the whole block. With `scroll="page"` the block is far taller than the window, so
the area is the part of the block that is **visible in the window** — a sticky
area, never `position: fixed` (the root clips its content, and that is a boundary
of trust): a sheet stands on the lower edge of that part, a window in its middle,
and the scrim covers the block. If you need the exact area, give the block a
height of its own (`scroll="screen"`). While the app bar is stuck, the elements of
the body that take keyboard focus keep clear of it (`scroll-margin-block-start`
= the height of the app bar + `stickyOffset`). The app bar draws the first two
visible actions; a third and further are not drawn.

Whatever you choose, the reader never touches the status bar of the system:
the `statusBarIcons` a screen asks for arrives in `onScreenChange` for you to
honour (see [Screen shown](#screen-shown)).

### The bottom zone: navigation bar and a pinned block

From schema 9.12 the bottom of a screen holds two things, and they never scroll
(`x-style.layout.bottomZone`, `x-style.layout.navBar`). Which child of the screen
root stands in which zone is decided by the **document order**, not by
visibility: the first child is the app bar when it is an `AppBar`; the **last**
child is the navigation bar when it is a `NavBar`; the last child that is left
and has `pin: "bottom"` is the **pinned block** (any node: a button, a row of two
buttons, a card with a price). Everything else is the body. A zone whose node is
hidden by a condition does not exist, and nobody takes its place. A `pin` in any
other place, or any other word, is not read — the node is an ordinary child.

Top to bottom the zone is: the pinned block (with the bottom padding of the root
under it), the navigation bar, the safe inset. The body ends at the top edge of
the zone and finishes with the screen's `gap` instead of the bottom padding, so
the last line of content is never hidden under the block. The navigation bar has
no padding of the root: it runs from edge to edge.

The bar draws the first five **visible** `NavItem`s in equal shares, an icon over
a one-line label. It is a `<nav>`; every item is a button with the label as its
name, and the item whose action is `navigate.section` to the shown screen carries
`aria-current="page"`. Pressing an item performs its action like a button does;
`navigate.section` makes the section the only screen of the stack (the cause of
the screen-shown event is `switch`) and a modal layer closes with everything on
top of it. A modal layer never draws the bar, but it does draw a pinned block at
its bottom.

With `scroll="page"` the bottom zone **sticks** to the bottom of the viewport
(`position: sticky; bottom: 0`) — `chrome` decides for both zones, `chrome="static"`
leaves the zone as the last row of the block, and `stickyBottomOffset` moves the
line when your site has a fixed bar below. A stuck pinned block paints the
background of the screen root under itself; elements of the body that take
keyboard focus keep clear of the zone (`scroll-margin-block-end` = the height of
the zone + `stickyBottomOffset`). The reader does not react to the screen
keyboard: the contract only names the rule for the day text inputs appear.

### Adaptive layout by width

One document serves every width: it is built for a phone, and wider classes override it
(schema 9.18). The reader measures the width of **its own root element** — not the window and
not the device — and picks a class: `compact` below 600 CSS pixels, `medium` from 600,
`expanded` from 1024 (the width is not rounded: 599.9 is `compact`). It resolves the tree for
that class and then draws it like any other document: `propsOn` and `styleOn` override the base
(`medium` on the base, `expanded` on the base with `medium`), `showOn` lists the classes a node
is shown on (together with its condition `visibleIf`), and `Screen.contentMaxWidth` puts the
content of the body, of the pinned block, of the app bar and of the navigation bar into a
centred column while the backgrounds stay edge to edge.

- **Give the root a width.** The class follows the width of the element only if the
  element has a width of its own (a block in a column, a grid cell). A root whose width
  depends on what it draws — inside a shrink-to-fit parent, or in an area whose scrollbar
  appears with the height of the content — would go round in a loop: the class changes the
  content, the content changes the width, the width changes the class. The reader stops it
  with a lock; the real fix is a width on the host.
  - **How a loop is recognised.** Four changes of the class within half a second. There
    are three classes, so the fourth change in a row always returns to a class that was
    already shown, whether the loop has two classes or three; a loop makes one change per
    repaint, a person does not cross a class boundary four times in half a second on purpose.
  - **What the lock does.** The class becomes the **narrowest** of the classes of the loop
    and stops changing.
  - **When the lock is lifted.** Under the lock the class is constant, so the layout is, so
    the width is. A width that **changes** under the lock (by more than half a pixel) was
    changed by the host — a window, a column — and not by the content: the lock is lifted
    and the class is taken from the new width. If the loop starts again it is locked again;
    every lift is paid for by a real change of the width, so this cannot run forever.
  - **Jitter at a boundary.** Dragging the edge of a window back and forth over 600 or 1024
    looks like a loop of two classes and is locked like one. It is told apart by the width
    under the lock, which is not the width the "loop" showed for that class. Such a lock is
    lifted by the next change of the width like any other, and if the width never changes
    again, by itself after one second (the class is then taken from the measured width; a
    real loop is locked a second time, and then for good). So a window that comes to rest at
    900 is `medium`, never `compact`.
- **Server rendering.** There is no width on the server, so the markup is `compact`.
  Pass `initialWidthClass` when you know the width of the place:

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

- Resizing the host switches the class without losing anything: the stack of screens, the
  chosen options, typed text, the position of the carousels and the focus stay. The body of
  the screen is **not rebuilt**: the root has one shape of markup on every class and with
  every combination of zones (root → body zone → body padding → content column → children),
  so a class that turns on `contentMaxWidth`, hides the app bar or the pinned block changes
  styles only — a text field stays the same element, keeps the focus and an unfinished IME
  composition, an expanded accordion stays expanded. The items of the navigation bar are
  built again when the bar moves between the bottom and the app bar; an item that had the
  focus has it again in the new place.
- The screen root has no `showOn` (the contract gives the field to every node but the
  root), so the reader does not read it there: a screen is shown on every width.
- **The navigation bar on a wide place.** On `medium` and `expanded` the bar stands at the
  **top**: inside the app bar when the screen has one that is shown in this class and by its
  condition (the items go into the trailing zone, before the actions; icon and label side by
  side), and as a bar of its own, edge to edge, when it has none. `widePlacement: 'bottom'` on
  the bar keeps it at the bottom on every width; on `compact` it is always at the bottom. When
  the items do not fit, the labels of **all** of them are hidden together (they stay the
  accessible name of the button), then the title shrinks to nothing, and what still does not
  fit is clipped at the end of the bar. The view depends on the width alone — on the natural
  width of the **text** of the title and of the labels — so the same width gives the same
  view whether the bar was being narrowed or widened. The bottom zone of a wide screen is the pinned block
  only; the safe inset is added only while that zone exists.
- **A modal sheet on a wide place.** A modal screen without `modalPlacement` (or with `bottom`)
  is a sheet on `compact` and a **window in the middle** on `medium` and `expanded`: at most 560
  wide, at most 85 % of the height of the area (or the area without margins — the lesser), the
  body scrolls while the header of the layer stays. The class of the **content** of the layer
  is taken from its own box, so a 560 window is always `compact` even over an `expanded` page.
  `modalPlacement: 'center'` is the window of 9.9 on every width. Closing, focus and `inert` under
  the layer did not change.

## Data

`data` is a flat map from data-contract path to value; `collections` holds the
lists for `Repeater` widgets. A value that is missing draws the `fallback` the
manager typed in the builder, and conditions follow the contract's rule for
missing values — the screen is always whole, with or without data, so you can
render first and fill the data in when it arrives.

Dates are bound as ISO strings and formatted by the renderer
(`Intl.DateTimeFormat`, the shown language, the device's time zone unless
`timeZone` is given).

### Sentences, numbers and plurals

Since schema 9.4 a text can be a **template** — one translatable sentence with
named places, `"{days} {unit} left · {price}"` — and a binding can say how its
value is written. All of it is document data; you only pass `data` as before:

| In the document | On the screen | |
|---|---|---|
| `format: 'number'` | `1,850` / `1 850` | Group and decimal separators of the shown language, grouping always on, up to three fraction digits. |
| `format: 'currency'`, `currency: 'JOD'` | `120 JOD`, `1,850.50 USD` | The amount, a no-break space, the ISO 4217 code — the same order in every language. A whole amount has no fraction; otherwise the digits of the currency. |
| `format: 'daysUntil'` | `4` | Whole days until the bound moment, rounded **up**, never below zero: `max(0, ceil((moment − now) / 24 h))`. No time zone is involved. |
| a `plural` value | `day` / `days`, `день` / `дні` / `днів` | The form whose CLDR category matches the number (`Intl.PluralRules`). The language is the one the shown forms are written in — the translation's if the forms are translated, the document's own otherwise — never the device's. |

The sentence and the plural forms are translated in the document
(`localization`), so a translator can reorder the places. A place whose value
has no data shows that value's own fallback and the rest of the sentence stays
(`— / 5 steps`); a place the document does not declare is drawn literally,
braces included — a typo is visible, not silent.

What the renderer expects from your `data` — the contract's rules, the same
in every reader:

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

**`now` is the renderer's clock.** `daysUntil` is counted when the screen is
rendered, from `now` — by default the clock of whoever renders. The screen
does not tick: re-render it (new `now`, new data) when you want a fresh number.
Pass `now` explicitly in three cases: server rendering (below), tests, and
previews of sample data.

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

The rules, in full (schema 9.2.0 — the same in the mobile renderer):

| The action is pressed… | `navigate` opens the screen… | `source.record` |
|---|---|---|
| in a list row | with the row's record (laid over the record of its own screen) | the same record |
| outside a list, the target is a **page** | **without** a record — "Back to catalog" from a details screen is a clean catalog | the record its screen was opened with, if any |
| outside a list, the target is a **modal** sheet | with the record of the screen beneath — "Redeem *{item.name}*?" is about the same record | the same |

Since 9.8 an action can say it explicitly: `navigate` with **`carryRecord: true`**
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
- **The record is a snapshot** taken when the row was pressed. Updating
  `collections` later does not change a details screen that is already open.
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

`setValue` and `toggleValue` are actions of the catalog that **the reader
performs**; a button, an icon button, a list row with an action or a pressable
card can carry them. A press does three things in this order: the analytics
event of the action (`onTrack`, once, also when nothing is written), then the
write — into the session of the reader and to `onWrite(path, value)` with a
typed value (a string, a flag or a number) — and nothing more. `onAction` is
**not** called for them, valid or not.

- The write goes through the same gate as an input field: `writablePaths`, the
  form of the path, no `__proto__` / `constructor` / `prototype` segments. A path
  the gate refuses is written nowhere and is reported as `ignored-input`.
- The path and the value are literals of the document. A binding next to them
  (`paramBindings`) is never read, so data cannot choose where the document
  writes.
- The current value is read with the data of the node (the record of the list
  row, the session, your `data`): pressing an option that is already chosen
  writes nothing, and a `toggleValue` writes the negation of what is shown.
- A node with `setValue` and a value is an **option**: `role="radio"` with
  `aria-checked`, chosen when its value lies under its path. Options that are
  children of one parent and write the same path are one group; each says its
  place (`aria-posinset` / `aria-setsize`). A node with `toggleValue` is a
  **toggle**: `aria-pressed`. A `setValue` without a value ("clear") and an
  invalid action are plain buttons. The reader draws no look of «chosen» of its
  own — put it into the `styleWhen` of the node.
- Every option is a tab stop; there is no arrow-key navigation between them.

## Forms

A document can ask the person for things: `TextField` (one line or several, with
a label, a placeholder, a helper and an error), `Switch` and `Checkbox`. The
value of each is a **data path** — the same flat map you already give as `data` —
and every change the person makes is written there at once:

- the renderer keeps what was written for the lifetime of the flow (same
  `documentId` and `entry`), so `visibleIf` conditions and bound texts of the
  screen update on every keystroke even if you do nothing with `onWrite`;
- `onWrite(path, value)` is called at the same moment: a **string** from a text
  field (on every change; a cleared field writes `""`; an IME composition is
  written when it ends), a **number** from a number field (below), a **boolean**
  from a switch and a checkbox, the chosen option (a string) from a
  `ChoiceGroup` with a bound value — a choice is written like a field, so the
  conditions and the buttons of the screen see it at once;
- if you put a value under the same path into `data`, it wins over what the
  person typed: that is how you normalise input or clear a field. A value of
  another type under the path (a number under a text field) is an empty field.

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

### Required fields, a disabled button, a number field

Schema 9.14 adds what a short survey needs. **The renderer decides everything
here from the document and from what the person typed; there are no new props
and no callbacks.**

- **`required`** on a `TextField`, a `Checkbox` or a `ChoiceGroup` (only the
  literal `true`): an asterisk after the label (colour `danger`, hidden from
  screen readers) and `aria-required`. The renderer shows **no text of its own**
  ("fill in this field") and never puts a field into the error state because it
  is empty — the error stays the string you put into `data`.
- **A form is the screen.** A field counts as *filled* by the **value under its
  path**, read through the layers (what the person typed, then `data`): a text
  you can hear, a number, `true`, a non-empty choice. A field hidden by
  `visibleIf` or disabled by `disabledIf` is not counted; a field in a tab that
  is not open is. A list drawn from data (`Repeater`) is not counted.
- **`requiresFilled`** and **`disabledIf`** on a `Button` or an `IconButton`: the
  button is disabled while the form of its screen is not filled, or while the
  condition holds. A disabled button is drawn at half opacity, keeps its place
  and **stays in the tab order** (`aria-disabled="true"`, not the `disabled`
  attribute); touch, Enter and Space do nothing — no `onAction`, no `onTrack`,
  no navigation. It comes alive **the moment the form is filled**, with the
  first letter, without waiting for your `data`.
- **A number field** — `TextField` with `valueType: 'number'`: a numeric
  keyboard (`inputmode="decimal"`), one line, left to right. The typed text is
  read by the contract's own rule (a minus, digits — Latin, Arabic-Indic or
  Persian, one separator `.` `,` or `٫`, at most 15 digits; no groups, no
  exponent), not by `Number()`. `onWrite` receives a **number**; a text that is
  not a number, or a cleared field, writes **`""`** (never `null`), and the field
  keeps what was typed. A number in `data` is shown as plain ASCII digits with a
  dot; a string under the path of a number field is an empty field.
  Once the user leaves the field, a non-empty text that is not a number puts it
  into the error state (the same look as a non-empty `error` from your data, and
  `aria-invalid="true"`); while it is focused, or once the text is a number or
  empty, there is no such state. The renderer adds no text: the `helper` of the
  field says what to type.

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

- Translations live **in the document** (`localization`); the manager edits
  them in the builder. Pass the **user's locale as the platform gives it** —
  `navigator.language`, the `Accept-Language` winner, `ar_EG` from a mobile
  bridge — and the renderer finds the translation itself:
  - `_` equals `-` and case does not matter: `ar_EG`, `ar-eg`, `AR-EG` are one tag;
  - subtags are dropped from the end until a language of the document matches
    (RFC 4647 Lookup): `ar-EG` → `ar`; `zh-Hant-TW` → `zh-Hant` → `zh`;
  - it never goes the other way: `locale="ar"` does **not** pick a document's
    `ar-EG`, and `pt-BR` does not pick `pt-PT`. Guessing a region would show
    people the wrong text silently — the builder warns the manager about a
    regional translation without its base language instead;
  - no match → the document's own language.

  This is the contract's rule (schema 9.1.0), the same in the mobile renderer.
- The answer is one per document: a string that has no translation in the
  chosen language falls back to the document's own text, not to a third
  language.
- Known limit: `zh-TW` falls to `zh` (usually Simplified) although Taiwan
  writes Traditional — the rule drops subtags and does not consult script
  data. Give the document a `zh-TW` translation if you serve Taiwan.

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

- Dates are formatted with the **requested locale** when a translation was
  found (`ar-EG` gives Egyptian formats next to Arabic text) and with the
  document's own language when it was not — never Arabic digits next to
  English text.
- Direction follows the language that is actually **shown**, not the one that
  was asked for: no Arabic in the document → left to right.
- Direction is a property of the script and comes from CLDR (`Intl.Locale`),
  not from a list in this package. It is set as `dir` on the screen's root
  only — your page is not touched.
- Layout is logical throughout (`start` / `end`): rows, paddings, corner radii
  and the back arrow flip; icons the contract marks as directional are
  mirrored; the tab strip's arrow keys swap.
- Values from your data are not translated — the backend already answered in
  the user's language.

## Server rendering and Next.js

`renderToString` and streaming work: nothing touches `window` or `document`,
the stylesheet and the theme variables are part of the markup, and the first
screen is fully styled before hydration.

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

**Set `timeZone` whenever a screen with dates is rendered on a server.** A
server usually runs in UTC and the browser does not; the same moment formatted
twice gives two texts ("Oct 31" and "Nov 1"), and React reports a hydration
mismatch. With `timeZone` both sides write the same text. Pick the zone that
is true for the user (their profile, your market) — or omit the prop and
render date-bound screens on the client only.

**Set `now` for the same reason** when the document counts days
(`daysUntil`): the server and the browser render at different moments, and a
deadline that crosses a 24-hour boundary in between gives "4 days left" in the
markup and "3 days left" after hydration. In a Server Component read the clock
once and pass it down — the number travels to the browser with the props, as
in the first example above.

Reports (`onReport`) fire in an effect, i.e. in the browser. On the server use
`checkDocumentVersion` and `resolveTheme(theme).reports` if you want to log
fallbacks there.

A screen that throws while rendering on the server does not fail the response:
the markup carries the neutral notice (`renderError`) in its place, and the
browser reports `render-error` after hydration.

## Styles and isolation

The renderer lives in the regular DOM of your page.

- **It does not leak out.** Every visual decision is an inline style; theme
  values are CSS variables (`--product-*`) set on the root element; the
  stylesheet contains only selectors scoped to `[data-hotlayout]`. Nothing is
  added to `<head>`, `<html>` or `<body>`.
- **Your page does not leak in.** A scoped reset (`all: unset`) with the
  specificity of an id selector removes whatever your global CSS gives to
  `button`, `div`, `img`, `p`, `*`… inside the screen, and the root restates
  every inherited text property. The reset matches descendants of the
  package's own root only — never an element of yours.
- **Nothing is drawn outside the root.** The root clips its content
  (`overflow: clip; contain: layout paint`). If the screen should scroll inside
  a fixed-height box, give the root `style={{ overflow: 'auto' }}` yourself.
- **The limit: `!important`.** A host rule marked `!important` still wins over
  the reset *and* over inline styles — `button { border-radius: 0 !important }`
  squares every button of the screen. Only Shadow DOM stops that, and it was
  not chosen because it breaks server rendering with hydration and hides the
  screen from your tests and tooling. If your CSS has global `!important`
  rules, either scope them away (`:not([data-hotlayout] *)`) or render
  `HotlayoutScreen` into your own shadow root.
- **Inherited properties you set on purpose.** `font-family`, `color`,
  `line-height` and the rest are restated on the root, so a `body` font does
  not reach the screen. That is intended: the screen's typeface is the theme's.

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

**What the package guarantees for an untrusted document and theme:**

1. **A value never becomes CSS it was not meant to be.** Each value is parsed
   by an allow-list of its form before it reaches a style: a colour is
   `#rrggbb` / `#rrggbbaa` and nothing else (not `red`, not `var(…)`, not
   `url(…)`); a number is a finite number clamped to the range of the schema
   (padding, radius, font size and weight, opacity, sizes, shadow offset / blur
   / spread, gradient stops, grid columns 2…4, `limit`, `maxLines`, `weight`); a
   token, role or asset name matches the token pattern, so nothing outside
   `[a-z0-9-]` gets into a CSS variable name; a font family is a name made of
   letters, digits, spaces and `. _ ' & + -`; an alignment, `fit` or direction
   is one of the listed values. A value that does not parse behaves as the
   contract's compatibility policy says for an unknown one (the property is not
   applied, or the field default is used) and is reported. This holds for
   server rendering too, where a `;` in a style value would otherwise start a
   new declaration.
2. **Shadows and gradients are assembled from checked parts**, so a "colour"
   cannot add a layer or an address. `url(…)` is produced only for images the
   document may legitimately name, and a theme cannot name an address at all.
3. **Nothing is drawn or clicked outside the root element.** The root clips
   its content (`overflow: clip; contain: layout paint`): a wide node, a
   shadow, a negative margin or the 48 px press area of a button cannot cover
   your page or take a click meant for your own controls, and a descendant
   cannot become `position: fixed` relative to the window.
4. **A malformed document or theme does not take your application down.**
   Whatever does not have the promised shape (a node that is not an object,
   `children` that is not a list, `null` where an object is expected) is
   ignored and reported; a theme with holes is completed from the built-in
   theme of the same brightness. If a screen still throws, the error is caught
   *inside* the renderer — in the browser and during server rendering — and
   replaced by a neutral notice (`renderError`), with a `render-error` report.
   The notice stays until `document.documentId` or `entry` changes (the same
   document would throw again); remount the component with `key` to retry.
5. **What reaches your handlers is checked.** `onWrite` is never called with a
   path that has a `__proto__` / `constructor` / `prototype` segment, and only
   for `writablePaths` when you give them; action `params` are own keys with
   string values. `source.record` is a fresh frozen map with the record's own
   keys of the data-path form only (no `__proto__`, `constructor` or
   `prototype` segment); its values are the ones you passed in `collections` —
   the document cannot name or change them, only choose which list is shown.
6. **No lookups through the prototype chain.** Data paths, binding formats and
   every table keyed by a string from the document are read as own keys.
7. **The stylesheet matches nothing of yours.** Its selectors are scoped to the
   package's own `[data-hotlayout]` root.

### Images: https only, unless you say otherwise

An image address named by the document or by bound data is loaded only if it
is an absolute `https:` URL. `http:`, `data:`, `blob:`, `javascript:`,
relative addresses and anything else are drawn as the placeholder and
reported. To narrow that to your own hosts, to route images through your
proxy, or to allow `http://localhost` in development, decide yourself:

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

**What the package does NOT guarantee:**

- **`!important` rules of your own page** still reach inside the screen — see
  [Styles and isolation](#styles-and-isolation).
- **The content of an image** you allowed. An `https:` image is still a
  request to that host from your user's browser (IP address, time, `Referer`),
  and the picture can show anything — including text that imitates your UI
  *inside* the screen's rectangle. Use `resolveImageUrl` and CSP to decide
  which hosts are acceptable.
- **The texts and the flow of the screen.** A document says what is written on
  a button and which action it carries; treat `onAction` as a request from the
  screen, and authorise it on your backend like any other request.
- **Size.** The renderer caps list length (50 records), theme tokens and the
  depth of the tree, but does not limit the size of the document itself; the
  builder publishes documents up to 1 MB.

**Recommended Content-Security-Policy** for the page that hosts the screen:

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
| **Modal screens** | WAI-ARIA Dialog: focus moves into the sheet and returns to what opened it, `Tab` cycles inside, `Esc` closes, the screen underneath is `inert`. |
| **Screen changes** | After the user navigates, focus moves to the new screen, so the next `Tab` starts there rather than at the top of your page. The first screen never takes focus. |
| **Names** | Images use the `alt` from the document — a string or a string of the document (a binding, a template), translated like any text (no `alt`, or an empty one → decorative, hidden from assistive technology). Icons likewise. The back arrow is named by `labels.back` (default `"Back"`) — translate it. |
| **Icon buttons** | An `IconButton` has no visible text; its accessible name is the `label` of the node, after translation and data binding (`aria-label`). A document that left the label empty still gets a working button, named by its icon in words (`chevron-left` → "chevron left"). An icon next to the label of a `Button` or a `Badge` is decorative and hidden from assistive technology; a badge with an icon is text, not a control. |
| **Text fields** | A real `<input>` / `<textarea>` with a visible `<label for>` as its name; the helper and the error describe it (`aria-describedby`), an error sets `aria-invalid` and is announced politely. Tab order is document order. |
| **Switches and checkboxes** | A `<button>` with `role="switch"` / `role="checkbox"` and `aria-checked`, named by its label; the whole row is the target; `Space` toggles (`Enter` too for a switch). |
| **Options and toggles** | A node with `setValue` is `role="radio"` with `aria-checked` and, among the options of one parent that write the same path, `aria-posinset` / `aria-setsize`; a node with `toggleValue` is a button with `aria-pressed`. Each is a tab stop; `Enter` and `Space` press. |
| **Choice groups** | `role="radiogroup"` with `role="radio"` rows and `aria-checked`; each option is a tab stop, selected by `Space` or `Enter`. |
| **Progress** | `role="progressbar"` with `aria-valuenow` / `aria-valuemax`. |
| **Language** | The root carries `lang` and `dir`, so a screen reader switches voice for an Arabic screen on an English page. |

Colour contrast is a property of the theme, and text alternatives are written
by whoever builds the screen — the renderer cannot add what the document does
not say.

## Versions

| Package | Document schema | Theme contract | React |
|---|---|---|---|
| 0.18.x | 9.19.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.17.x | 9.19.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.16.x | 9.18.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.15.x | 9.18.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.14.x | 9.17.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.13.x | 9.14.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.12.x | 9.13.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.9.x | 9.8.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.8.x | 9.7.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.7.x | 9.5.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.6.x | 9.4.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.5.x | 9.3.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.4.x | 9.2.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.3.x | 9.1.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.2.x | 9.1.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |
| 0.1.x | 9.0.x (any 9.x is drawn) | 4.0.x (any 4.x is drawn) | 18, 19 |

**Icons.** The package embeds icon set 1.0.0 (`READER_ICON_SET_VERSION`):
332 names, drawings from Lucide (ISC) and ten of our own, licence texts in
`THIRD-PARTY-NOTICES.md`. An icon name is document data, so the reader cannot
know which names it will meet and carries all of them: about 60 KB of compiled
JavaScript (18 KB gzipped) in its own module, `icon-set.js`. A name outside the
set draws an empty box of the same size. The set version is independent of the
schema version: a redrawn icon is a patch of the set.

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

What the user sees:

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
- The loaders are optional conveniences. Any way of getting the JSON works:
  your own API, a server component, a bundled file as the offline fallback.

## Limitations

- **No schema validation.** The builder validates on publish, and the renderer
  parses every value it turns into CSS or hands to you
  ([Security model](#security-model)) — but it does not tell you that a
  document is *invalid*. If you accept documents from elsewhere, validate them
  with `screen-schema.json` and any JSON Schema validator at your boundary.
- **No data fetching, no cache.** `data` and `collections` are yours.
- **Navigation params are not screen data.** `action.params` are handed to
  `onNavigate` / `onAction`, not read by bindings. A screen gets its record
  from the list row that opened it — see
  [One screen, many records](#one-screen-many-records) — and a screen opened
  through `entry` gets none: put the record into `data`.
- **The screen does not tick.** "Days left" (`daysUntil`) is counted when the
  screen is rendered, from `now`; nothing re-renders it at midnight. Hours and
  minutes until an event are not in the contract.
- **Currency is written with its code**, after the amount (`120 JOD`), in every
  language, unless the binding names `currencyDisplay: 'symbol'` and / or
  `currencyPosition: 'before'`; a code the closed table of signs does not have
  stays a code. Percent and compact notation (`1.2K`) are not formats either —
  a percent is written with a template, `{percent}%`.
- **Arabic digits depend on the locale you pass.** Digits and separators come
  from the platform's CLDR data: `ar-EG` writes Arabic-Indic digits, plain `ar`
  writes Latin ones in current browsers.
- **Carousel state is the reader's.** Which card is open is not in the
  document and is not reported to the host; it is kept while the screen is in
  the stack. No animated scrolling is ever started by the reader.
- **No animation.** The contract says *what* to show; screens appear without
  transitions, and motion is up to the host.
- **Modal screens are bottom sheets or windows** (`modalPlacement`) of content
  height, inside the root element — not a browser-level `<dialog>`, and not
  full-viewport unless the root is (with `scroll="page"` they live in the part of
  the root visible in the window). A layer has no built-in look: its
  background, radius and shadow are the `style` of the screen root.
- **No scroll management.** The renderer neither scrolls your page on a screen
  change nor restores positions on "back".
- **Local UI state is not persisted.** The open tab, expanded accordions and
  unbound choices reset when the screen is left.
- **Buttons are as big as the contract says, not bigger.** A small button is
  28 px high and a small icon button 28 × 28 under the built-in theme. The
  renderer adds no minimum size; the *touch target* is an invisible 48 px area
  around the button that does not take part in layout — leave room around
  small buttons you place next to your own controls.
- **Choice groups and options built from own nodes have no arrow-key
  navigation**; each option is a tab stop.
  A radio group has no accessible name of its own (the contract has no field
  for one).
- **Fonts and real asset files are not shipped** — see [Fonts](#fonts) and the
  `assets` prop. The icon set is the contract's, and the whole of it is
  embedded (see [Versions](#versions)).
- **Host `!important` rules get through** — see
  [Styles and isolation](#styles-and-isolation).
- **Browsers:** current evergreen browsers (CSS logical properties, `:is()`,
  `aspect-ratio`, `inert`, `Intl.Locale`). No Internet Explorer.

The rules the renderer follows are those of the HotLayout contract; the sections
above state the ones a host meets. Changes between versions: [CHANGELOG.md](CHANGELOG.md).

## License

Apache-2.0 — see [LICENSE](LICENSE).
