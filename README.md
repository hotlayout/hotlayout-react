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

- The examples call the variable `layout`, not `document`: inside a component
  `document` would shadow the browser's own `document`.
- Give the root a height (`style={{ minBlockSize: '100dvh' }}`). The root is a
  flex column that takes the size you give it, the screen background reaches
  its bottom, and modal sheets sit on the bottom edge of its area.
- Where `document` and `theme` come from is up to you: bundle them, fetch them
  on the server, or load them by URL so that a republished screen reaches users
  without a deploy. The published files are static JSON readable without a
  token; see [Delivery](https://hotlayout.com/docs/integrator/delivery) and
  [Load the published document and theme](https://hotlayout.com/docs/integrator/quickstart-react#3-load-the-published-document-and-theme).
- The keys of `data` and `collections` are the project's **data dictionary**,
  downloadable from the admin as `data-contract.json`; see
  [Data dictionary](https://hotlayout.com/docs/integrator/data-dictionary).

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
  become CSS, an address or a key — see [Security](#security).
- **Nothing but React.** No runtime dependencies besides `react` and
  `react-dom`; styles are scoped to the component's own root.
- **Placements.** `<HotlayoutPlacement>` draws whichever published document the
  admin put into a named place of your app.
- **One document, two platforms.** The same JSON is drawn in a mobile app by
  the Flutter package
  [`hotlayout_flutter`](https://pub.dev/packages/hotlayout_flutter).

### What the renderer does on its own

- Keeps the **screen stack**: `navigate` and `navigate.back` work out of the
  box, and a screen with `presentation: 'modal'` is a bottom sheet with dialog
  semantics (focus moves in, `Esc` or a tap on the scrim goes back).
- Switches **tabs, accordions and choice groups** itself; the document only
  says the initial state.
- Applies the **compatibility policy**: an unknown widget draws its children, an
  unknown token is skipped, a document of another schema **major** is refused
  loudly.
- Never blanks the screen: an unreadable theme falls back to the built-in one
  and an image without a usable address is drawn as a neutral placeholder; you
  are told through `onReport`.
- Sets `dir` from the language the document is shown in and mirrors directional
  icons; draws motion and blur only when the system does not ask to reduce it.
- Makes buttons *pressable* in an area of at least 48 × 48 px without shifting
  neighbours.

Spacing, colours and typography come from the theme, layout rules from the
contract: the renderer invents nothing.

## What your app does

The component is controlled through props; the ones you reach for first:

| Prop | What it is for |
|---|---|
| `document`, `theme` | The published layout and theme (parsed JSON). |
| `data`, `collections` | Values and lists the document binds to, keyed by the data dictionary. |
| `locale` | The language to show; the document's translation is chosen by it. |
| `entry` | The entry point (screen) to show; change it to drive navigation from your router. |
| `onAction` | Receives every action the renderer does not run itself (`submit`, `openUrl`, catalog actions…). |
| `onWrite`, `writablePaths` | What the person typed or chose, and which data paths the document may write. |
| `onReport` | Every fallback the renderer took, with the reason. |
| `resolveImageUrl` | Your decision about which image addresses are loaded. |

Every prop, the shape of reports, analytics and the screen-shown event,
actions and haptics, layout, forms and the rest are in the
[React reference](https://hotlayout.com/docs/integrator/react-reference).

## Server rendering

The package touches no browser global on import, so `checkDocumentVersion` and
`loadDocument` work in a Next.js Server Component. Only `HotlayoutScreen.js`
and `HotlayoutPlacement.js` carry `"use client"`, so the plain functions of the
entry stay callable on the server. See
[Server rendering and Next.js](https://hotlayout.com/docs/integrator/react-reference#server-rendering-and-nextjs).

## Versions

This version reads layout documents of schema **9.33.x** and themes of theme
contract **4.0.x**, and embeds icon set 1.0.0. Any 9.x document and any 4.x
theme is drawn; React 18 and 19 are supported by every release.

The rule is the contract's: the **major must match**; a minor only adds
optional things; a patch changes nothing a reader can see. A document of a newer
minor is drawn and the unknown parts are skipped; a document of another major
is refused, and `checkDocumentVersion` tells you which side is newer.

<!-- example: versions-and-loading.tsx#version -->
```tsx
checkDocumentVersion('9.0.0') // { kind: 'compatible' }
checkDocumentVersion('9.99.0') // { kind: 'newer-minor', documentVersion: '9.99.0' } — drawn, the unknown is skipped
checkDocumentVersion('10.0.0') // { kind: 'incompatible', reason: 'major 10 is not readable by a major-9 reader', relation: 'document-newer' }
console.log(`this build reads schema ${READER_SCHEMA_VERSION}`)
```

Which package version reads which schema, and what each schema minor added:
[Versions in the reference](https://hotlayout.com/docs/integrator/react-reference#versions)
and [Compatibility](https://hotlayout.com/docs/integrator/compatibility).
Changes between package releases: [CHANGELOG.md](CHANGELOG.md).

## Security

The layout document and the theme arrive over the network, and whoever can
publish them can change what your users see. The builder validates both on
publish, but **the renderer does not rely on that**: every value is parsed
again at the point where it becomes CSS, an address or a key.

- **Nothing becomes CSS it was not meant to be.** Colours, numbers and token
  names pass an allow-list of their form before they reach a style.
- **Images: `https:` only.** An image address is loaded only if it is an
  absolute `https:` URL with a public host name; anything else is drawn as the
  placeholder and reported. Narrow it further, or route images through your
  proxy, with `resolveImageUrl`.
- **The document cannot choose where it writes.** With `writablePaths` (a list
  or a predicate) a write to any other path never reaches `onWrite`; without
  it, any path of the dictionary form is allowed, but never `__proto__`,
  `constructor` or `prototype`. Name the paths your app accepts.
- **A malformed document does not crash your app.** A node of the wrong shape
  is ignored and reported (`ignored-input`); an error inside a screen is caught
  by the package, also on the server.
- **The root clips its content** and its styles are scoped to its own root, so
  the screen cannot cover or intercept clicks on your page.

The full guarantees, what the package does not guarantee and the
Content-Security-Policy to use:
[Security model](https://hotlayout.com/docs/integrator/react-reference#security-model).

## Documentation

Everything below lives on [hotlayout.com/docs](https://hotlayout.com/docs).

**Get started**

- [Quickstart for React](https://hotlayout.com/docs/integrator/quickstart-react) — install, first screen, loading, data, actions, writes, analytics, Next.js
- [React reference](https://hotlayout.com/docs/integrator/react-reference) — the complete reference, by topic:
  [API](https://hotlayout.com/docs/integrator/react-reference#api) ·
  [Actions and navigation](https://hotlayout.com/docs/integrator/react-reference#actions-and-navigation) ·
  [Screen layout](https://hotlayout.com/docs/integrator/react-reference#screen-layout) ·
  [Data](https://hotlayout.com/docs/integrator/react-reference#data) ·
  [Forms](https://hotlayout.com/docs/integrator/react-reference#forms) ·
  [Theme](https://hotlayout.com/docs/integrator/react-reference#theme) ·
  [Fonts](https://hotlayout.com/docs/integrator/react-reference#fonts) ·
  [Languages and right-to-left](https://hotlayout.com/docs/integrator/react-reference#languages-and-right-to-left) ·
  [Styles and isolation](https://hotlayout.com/docs/integrator/react-reference#styles-and-isolation) ·
  [Accessibility](https://hotlayout.com/docs/integrator/react-reference#accessibility) ·
  [Placements](https://hotlayout.com/docs/integrator/react-reference#placements) ·
  [Updating a screen without a release](https://hotlayout.com/docs/integrator/react-reference#updating-a-screen-without-a-release) ·
  [Limitations](https://hotlayout.com/docs/integrator/react-reference#limitations)
- [Embedding the editor](https://hotlayout.com/docs/integrator/embedding)

**Concepts**

- [Delivery](https://hotlayout.com/docs/integrator/delivery) — how a published document reaches the app
- [Placements](https://hotlayout.com/docs/integrator/placements) — named places that show what the admin chose
- [Data dictionary](https://hotlayout.com/docs/integrator/data-dictionary) — the paths and lists a document may bind to
- [Theme](https://hotlayout.com/docs/integrator/theme) · [Localization](https://hotlayout.com/docs/integrator/localization)

**Reference**

- [Widgets](https://hotlayout.com/docs/integrator/widgets) — every widget and property
- [Compatibility](https://hotlayout.com/docs/integrator/compatibility) — the version rules and what an older reader shows
- [Contract changelog](https://hotlayout.com/docs/integrator/changelog) — what each schema version added
- [Network requirements](https://hotlayout.com/docs/integrator/network-requirements) · [Self-hosted](https://hotlayout.com/docs/integrator/self-hosted)

Also: the [video quickstart](https://youtu.be/YVLhz5-z_bs), and the builder at
[hotlayout.com](https://hotlayout.com). To get access, use "Get access" there or
write to [contact@hotlayout.com](mailto:contact@hotlayout.com).

## License

Apache-2.0 — see [LICENSE](LICENSE).
