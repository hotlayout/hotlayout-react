# Changelog

All notable changes to `@hotlayout/react` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is `0.x`, a minor release may contain breaking changes; they
are listed under **Changed** or **Removed**.

The package version is independent of the contract versions. Which documents
and themes a release reads is stated in every entry.

## [0.26.0] - 2026-10-19

**Reads:** schema 9.28.x (theme contract 4.0.x, icon set 1.0.0).

### Added

- **The list budget of a screen.** A screen draws at most 2550 instances of list templates, nested lists included, counted in document order depth first; what does not fit is not drawn and is reported once (`ignored-input`). The builder does not publish a screen over the budget, so this only cuts a document made elsewhere.

### Changed

- **Theme numbers out of bounds.** A number of the theme outside the bounds of the theme schema, or infinite, is replaced by the value of the same token and field in the built-in theme of the same brightness (spacing, radius, typography), otherwise by the nearest bound, and listed in the `invalid-theme-values` report. Before, it was clamped to the bound without a word.
- **Transparent content is not part of the name of a card.** A node whose own opacity is 0 is `aria-hidden` together with what it holds; a text whose colour (own or inherited) resolves with opacity 0 is too. The colour is judged on the resolved value, not on the CSS string.
- The default picture rule, the network limits and the focus of a modal layer of 0.25.0 are now rules of the contract (schema 9.28.0); their behaviour is unchanged.

## [0.25.0] - 2026-10-19

**Reads:** unchanged (schema 9.27.x, theme contract 4.0.x, icon set 1.0.0). A hardening release.

### Added

- **`trapFocus`** prop (default `false`): keep `Tab` inside a modal layer at all times.

### Changed

- **Safer picture default.** Without `resolveImageUrl`, an address is loaded only when it has the host form of an `openUrl` link: a letter top-level label, no credentials, no IP literal in any notation, no `localhost`. `allowedByDefault` is `false` for the rest; `resolveImageUrl` can still allow them.
- **No `Referer` for pictures.** Every `<img>` carries `referrerPolicy="no-referrer"`, `loading="lazy"` and `decoding="async"`. Lazy images are not preloaded, so the server markup no longer hoists a `<link rel="preload">` out of the root. CSS background images follow your page's `Referrer-Policy`.
- **Focus.** Only a dismissible modal layer cycles `Tab`; a layer that cannot be dismissed, or has nothing to focus, lets `Tab` leave the package unless `trapFocus` is set.
- **Less in the logs.** For an address that came from data, `console` and `onReport` carry the scheme and host only, never the path or the query.
- A script address is recognised as the URL parser reads it (leading control characters and spaces stripped, tab and line breaks removed), also in the answer of `resolveImageUrl`.
- Text with `opacity` 0 or a colour with zero alpha is `aria-hidden` and not part of the name of a pressable card.

## [0.24.0] - 2026-10-17

**Reads:** layout documents of schema **9.27.x** and themes of theme contract **4.0.x**, icon set 1.0.0. The additions of 9.26 are optional and have no default: a document without them is drawn as before, except for the two rules that need no field (a modal sheet follows the finger down, and a page opened from a list row follows the data).

### Added

- **Long press.** `longPress` and `longPressLabel` on `Column`, `Row`, `Container`, `Stack` and `ListTile`. A pointer that stays down for 450 ms within 10 CSS pixels runs the action while it is still down; the click after the release is swallowed. The action goes through the same `onHaptic`, `onTrack` and `onAction` as a press (no new prop), once, in that order, with the record of the row. The touch goes to the innermost control under the finger, so a button in a card keeps its press. `ContextMenu` and `Shift+F10` on the focused node run it at once; `Enter` and `Space` stay the press. A container with only a long press is a control (tab stop, `role="button"`, named by its content). The name of the action is a hidden element the node is described by (`aria-describedby`), and `aria-keyshortcuts="ContextMenu Shift+F10"` lists the keys. The `contextmenu` event on such a node is cancelled; a right mouse button is not a long press.
- **Grouped lists.** `Repeater.groupBy` with a second child as the header of a group. Groups are made from the drawn records (after `where` and `limit`), in the order of the data; the header is drawn in the scope of the first record of its group and a press inside it carries that record. Headers and records share one `gap`; a hidden header takes no room; numbered items count records only. A grid or a row is drawn without headers.
- **A sheet that follows the finger down.** A modal sheet from the bottom is dragged by any point while its body is scrolled to the top: it starts after 10 px when the move is more down than sideways; on release a fling of 700 px/s decides, otherwise 0.3 of the height. It returns in 250 ms or goes down in 200 ms and only then performs the same `navigate.back` as a tap on the scrim (the `back` show event comes after the exit; a refusal in `onNavigate` brings the sheet back). The node under the finger is cancelled when the sheet takes the touch, and the click after a drag is not a press. No `touch-action` is set, so the body keeps its own scrolling. A centred window is not dragged.
- **`dismissible: false`** on the entry of a modal screen: no drag, no tap on the scrim, no `Esc`. `navigate.back` from inside the layer still closes it. On a page the field is not read.
- **A page follows the data.** The record of every frame of the stack (opened from a list row, inherited by a modal layer, carried by `carryRecord`) is kept as a chain of links — the collection, the entity and the fields of each list instance it came from — and is looked up by `<item>.id` whenever `collections` change: first in the collection of the row, then in the other collections of the same entity that the document names. A record found is replaced whole; one found nowhere stays as it was last seen. A refresh is not a show: the stack, `onScreenChange`, analytics, scroll and typed text stay, and a bound number with `animateChanges` counts to its new value. An action from the page hands the host the refreshed `source.record`.

### Changed

- The reader version is 9.27.0.
- A screen opened from a list row no longer keeps a snapshot of the row: pass other `collections` and it shows the new values. A record without an `id` is not live and stays as it was.

### Security

- `longPress` is read by the same checked path as `action` (a closed catalogue, own string parameters, a haptic word of the list, an event of the named form). Its label is a document string that only becomes text; the id that links it to the node is made by React, never taken from the document, and `aria-keyshortcuts` is a constant. `groupBy` is read from the record only, as an own key. `dismissible` acts only as the word `false`. A guard walks every leaf of both new fixtures, and the data the groups and the live record are read from, with a hostile string and number.

## [0.23.0] - 2026-10-16

**Reads:** layout documents of schema **9.25.x** and themes of theme contract **4.0.x**, icon set 1.0.0. The additions of 9.25 are optional and have no default: a document without them is drawn as before, except for the two rules that need no field (the steps of a bar fill smoothly during a value transition, and a pressable node gives feedback to the finger).

### Added

- **The steps of a bar fill smoothly.** While the value of a bar with `segments` runs a transition (`animateChanges`, `animateIn`) the filled steps are a number with a fraction on the way from the whole steps of the old value to the whole steps of the new one; the step it reaches is cut at that share and keeps its radius. The ends are pictures at rest, a change inside one step moves nothing, and "reduce motion" shows whole steps at once.
- **`glow: "soft" | "strong"`** on `ProgressBar` and `CircularProgress`: a blurred copy of the fill paint under the scale (blur 4 and 8 px, opacity 0.55 and 0.9). A bar with steps lights one step. The glow takes no room and is not clipped by the scale itself.
- **`style.shadowColor: "background"`**: the layers of `style.shadow` take the hue of the node's own background (the stop nearest to the middle of a gradient) and keep their own opacity; also on a button and an icon button.
- **Press feedback.** The node that performs a press scales to 0.97 (a card, a row), 0.96 (a button) or fades to 0.7 (an icon button, a ghost button, a navigation item): 80 ms down, 160 ms back with a slight overshoot, driven by the pointer so a short tap still reaches the pose. No feedback from the keyboard; under "reduce motion" only the fade. `pressFeedback: "none"` on a node turns it off.
- **`haptic` on an action and the `onHaptic(kind, source)` prop.** One of `light`, `medium`, `heavy`, `selection`, `success`, `warning`, handed to the host once per press, before `onTrack` and the action. The package never vibrates by itself; the README shows `navigator.vibrate`.
- The type `HapticWord` is exported.

### Security

- `glow`, `style.shadowColor`, `pressFeedback` and `haptic` are words of closed lists; the glow numbers come from the contract, the shadow colour is composed from channel numbers, and only a word of the list ever reaches the host. A guard walks every leaf of the new fixture and every hostile shape of the four fields.

### Changed

- The reader version is 9.25.0; nothing of 9.25 is skipped any more.
- `ActionHandler` presses carry the haptic word (`PressExtras.haptic`); the `Shown` data of a value transition carries the ends of the scale transitions in progress.

## [0.22.0] - 2026-10-16

**Reads:** layout documents of schema **9.24.x** and themes of theme contract **4.0.x**, icon set 1.0.0. The additions of 9.24 are optional and have no default: a document without them is drawn exactly as before.

### Added

- **A value that grows when shown (`animateIn: true`).** On `Text`, `ProgressBar` and `CircularProgress` the numbers of the node grow from zero to their own with the curve, duration and step of `animateChanges`: a text counts the numbers it is bound to, a scale its value (a literal one too) while the maximum stands. Shown means drawn on a shown screen: the first screen, a screen pushed on top, a screen shown again by "back" or a section switch, a node that appears. Closing a modal layer and a change of data are not a show. "Reduce motion", no number and zero give the value at once. With `animateChanges` a change of data during the appearance leads from the shown value; without it the new value is there at once and a change of language ends the appearance. **A node hydrated from server markup does not grow on its first show**, so hydration never differs from the markup and never drops to zero; the server markup is the final value.
- **The busy state after drag to confirm.** Released past the threshold, the action runs at once and the thumb glides to the end (200 ms) and stays there, busy: a ring of three quarters instead of the icon (800 ms a turn), `aria-busy`, no more drag, press or key. `onAction` may return a `Promise`: the state lasts until it settles, fulfilled or rejected, then the thumb returns (250 ms). Without a promise it lasts until the shown screen changes or eight seconds pass. An action of the reader changes the screen at once; `none` and an invalid standard action return the thumb at once.
- **The motion of the dot on a navigation item.** The dot pops in (scale 0, 1.25 at 0.6, 1 over 320 ms) and fades out (200 ms, kept in the markup until it is over) when its condition changes on a shown screen; a new change starts its own motion. No motion on the first show, on a screen shown again, with "reduce motion" or on the server.
- **Nodes pinned to the top (`pin: 'top'`).** The children of the root in a run at the start, right after the app bar zone, stand in a top zone under it and never scroll; the body scrolls below them, a gap of the screen under the zone, clipped at its bottom edge. Without an app bar the zone starts at the root top padding under the safe inset. The `pull` of the first node is not read; hidden nodes take no room; the word is not read with `bodyTop: 'screenTop'`. With `scroll="page"` the zone sticks right under the app bar by the same `chrome` switch. The same in every width class and in a modal layer.

### Security

- `animateIn` is the literal `true` or nothing; `pin` acts only as the exact word `top` in the run at the start of the root; the answer of the host to an action is a promise only when it is an object with a `then` function, read once (a throwing getter is no promise), and a rejection is handled by the button. A literal value of a scale travels beside the data, never inside them, so a data key cannot set it. A guard test replaces every leaf of the new frame, and every shape of the new fields, with hostile values.

### Changed

- `ActionHandler` now returns what the press learned (who runs the action, the promise of the host); the `onAction` prop type returns `unknown` (a promise is read, anything else is ignored), so every existing handler still type-checks.
- The reader version is 9.24.0; nothing of 9.22, 9.23 or 9.24 is skipped any more.

## [0.21.0] - 2026-10-16

**Reads:** layout documents of schema **9.23.x** and themes of theme contract **4.0.x**, icon set 1.0.0. The additions of 9.22 and 9.23 are optional and have no default: a document without them is drawn exactly as before.

### Added

- **A floating navigation bar (`NavBar.float`).** With the bar in the bottom zone the whole zone — the pinned block and the bar — lies over the body: the body area reaches the bottom of the screen, the content scrolls under the bar, and the end of the body adds the measured height of the zone so the last row scrolls clear of it. The bottom safe inset is the transparent room under the box of the bar. The look is the `style` of the node (nothing is built in). Only the boxes of the block and of the bar catch presses. With `scroll="page"` the zone sticks to the bottom of the host page, with no backdrop. Not read where the bar stands at the top.
- **A dot on a navigation item (`NavItem.badgeWhen`).** A condition of the form of `visibleIf`; while it holds, a dot of 8 in the theme colour `accent` stands on the top corner of the icon at the end of the line. Hidden from screen readers, the name of the item is unchanged; a condition the reader does not understand draws no dot.
- **Drag to confirm (`Button.confirm: 'swipe'`).** A track with a round thumb at the inline start (the icon of the button or a chevron, in the colours of the role). Dragging it past 90% of the way and releasing runs the action, the analytics event once before it; less returns the thumb. A pointer press with no drag does nothing; Enter, Space and an activation from a screen reader act at once, a held key repeating does not. The thumb moves with the writing direction, returns by itself (a jump with "reduce motion"), and a disabled button does not move. The drag is taken once it goes more along the line than across, so the body keeps scrolling vertically.
- **A dashed border (`style.border.style: 'dashed'`).** The contract's pattern — the centre line of the border with arcs at the corners, a dash of three and a gap of two widths, the count closed without a seam — drawn as a `border-image` over the border box once the box is measured (not `border-style: dashed`). The border keeps its room as a transparent solid one; on the server and before the first measurement the dashes are absent.
- **A filtered list (`Repeater.where`) and the emptiness of a filtered list.** Records that pass the condition, evaluated on each record in its own scope, are the records the list draws: the grid closes up, the carousel counts cards, stops and dots by them, numbered rows count them, and `limit` takes the first records that passed. A comparison with no operand passes every record. A condition on the collection with `item` and `where` counts the same records, without `limit`.
- **A comparison with another path (`valuePath`).** An operand read in the same scope as `path`, in every place a condition is read; with nothing under it the condition does not hold, `eq` and `neq` alike.
- **A gradient on the letters (`style.textGradient`).** Read by `Text` only, not inherited. One gradient over the whole content box of the text; a part with its own colour keeps it; the line of an emphasis and the marker of a list item keep the ordinary colour, as does the whole text when the gradient does not resolve.
- **Compact numbers (`notation: 'compact'`).** `48.2K` / `48,2 тис.` by the contract's arithmetic and closed suffix table, not `Intl` compact; the sign, parts and plural word follow the full value.

### Security

- `float`, `confirm` and the word of `border.style` are the literal `true` or a word of a closed list; `badgeWhen`, `where` and the operand path go through the same reading of a condition as `visibleIf` and read only own keys of the data; the nesting of a filter is not followed. The gradient and the colours of the dashes pass the same sanitising as the background, the markup of the dashes is made from numbers and one composed colour (a data URL is composed only in `sanitize.ts`), and the suffix of a compact number comes only from the table. A guard test replaces every leaf of the new frames, and every shape of the new fields, with hostile values.

### Changed

- The reader version is 9.23.0; nothing of 9.22 or 9.23 is skipped any more.
- Internal: `isDisabledBy` shares its reading of a condition with the dot (`isUnderstoodConditionMet`).

## [0.20.0] - 2026-10-16

**Reads:** layout documents of schema **9.23.x** (parsed; the additions of 9.22 and 9.23 are not drawn yet) and themes of theme contract **4.0.x**, icon set 1.0.0. The four additions of 9.21 are optional and have no default: a document without them is drawn exactly as before.

### Added

- **A number that counts to its new value (`animateChanges`).** On `Text` (a bound number or currency, also inside a sentence with its plural word), `ProgressBar` and `CircularProgress` (the fill, the arc and the label). 700 ms, ease-out; whole steps for whole numbers, the cents of the currency or three digits otherwise; a scale grows without a step. No transition for the first draw (so none on the server or while hydrating), a node that appears, a language changed in the same step, the system "reduce motion", a value that is not a number on either side, or the same value; a change in the middle starts from the number shown. Driven by `requestAnimationFrame`, so a hidden tab stops it; the screen reader hears the final value only.
- **A countdown (`countdownPart`).** One part of the time left until a date, with `unit` (`days`, `hours`, `minutes`, `seconds`) and `pad`: rounded down, written like `number`, and the number a plural word agrees with. A screen that shows a part keeps one timer — every second when a part is `seconds`, otherwise every minute, none without a countdown — and only the texts that show a part are drawn again. It starts after the mount and stops with the screen; a hidden tab draws nothing until it is visible again. With `now` given by the host nothing ticks.
- **Round ends (`cap: 'round'`)** on `ProgressBar` and `CircularProgress`: half-circle ends of half the thickness for a bar (the theme `pill` is not read, a non-zero fill is never shorter than the thickness); half-circle ends inside the filled part for a ring arc, a dot for a tiny share, no ends and no seam when full; a gradient runs along the whole filled part and an end takes its colour at its own centre.
- **An app bar that changes when the body scrolls (`styleScrolled`, `titleShown: 'scrolled'`).** The look of the bar once the body has scrolled under it (`background`, `color`, `shadow`, `backdropBlur`, laid last over the base, the width layers and the state; never its box), and a title drawn only then (at rest it keeps its place and its accessible name). The root listens to the scroll of its own body, passively, and only when the app bar zone asks.

### Security

- `cap` and `titleShown` are words of a closed list, `styleScrolled` is read for its four known fields and goes through the same sanitising as `style`, `animateChanges` is the literal `true`, `unit` and `pad` are words of a closed list, and every number on the way of a transition is a finite number the data gave. A guard test replaces every leaf of the new frame, and every shape of the new fields, with hostile values.

### Changed

- The reader version is 9.23.0. The three additions of 9.23 are skipped, each with the price the contract names: `Repeater.where` and the filtered emptiness (every record is drawn and counted), a comparison by `valuePath` (no operand), `style.textGradient` (the fallback colour) and `notation: 'compact'` (every digit).
- 9.22: the four additions are skipped, each with the price the contract names: `NavBar.float` (the body ends above an ordinary bar), `NavItem.badgeWhen` (no dot), `Button.confirm: 'swipe'` (an ordinary button, a tap acts) and `style.border.style: 'dashed'` (a solid border).
- A text that shows a countdown part is exempt from React's hydration text check and is drawn anew once the screen clock is live: a server and a browser read two clocks, and the number of the browser wins at once. Pass `now` when you want the same markup on both sides.

## [0.19.0] - 2026-10-16

**Reads:** layout documents of schema **9.20.x** and themes of theme contract **4.0.x**, icon set 1.0.0. The three additions of 9.20 are optional and have no default: a document without them is drawn exactly as before.

### Added

- **Motion of a node (`motion`).** `float` (a drift along `vertical`, `horizontal` or `both` axes by up to `amplitude` pixels) and `pulse` (a breath in scale and, optionally, opacity), each with a `duration` and an optional `delay`. It is only painting: the layout never changes, neighbours do not move, a clipping parent still clips. A registered angle variable is turned by one linear animation and `translate`, `scale` and `filter: opacity()` compute the pose with `sin()` / `cos()`, so the position at any moment equals the contract's formula. Horizontal drift goes toward the end of the line (mirrored in right-to-left writing). A node that appears again starts from zero. The system "reduce motion", the server render and a form the reader does not know all leave the node at rest. The style sheet gained one `@property`, one `@keyframes` and a few rules, all prefixed with `hl-`.
- **Blur under a modal layer (`backdropBlur` of a screen entry).** A blur layer lies between everything under the layer (with its app bar and navigation bar) and the scrim, in the same area; the layer itself is never blurred and a tap beside it still dismisses it. Not read for a page.
- **Glass (`style.backdropBlur`).** `backdrop-filter: blur(Npx)` (also prefixed for older Safari) on the box of the node, clipped by its radius; on a button, an icon button and a badge it is the surface of the role. States and width layers can name or unset it. Not inherited.

### Security

- The new numbers reach the style only as whole numbers or fractions within the bounds of the schema (`exactInteger`, `exactNumber` in `sanitize.ts`); a value the schema would not accept means no field, never the nearest allowed one. A guard test replaces every leaf of the new frame and every shape of the new fields with hostile values.

### Changed

- The reader version is 9.20.0, and `backdropBlur` is a known key of `NodeStyle`.
- Internal: source files split by widget family (`render/`), by concern of the screen stack (`screen/`) and by rule group (`style-box`, `style-roles`, `layout-rules`, `input-number`, `inputs-layout`, `wide-nav`, `wide-modal`); no behaviour change, the public entry is the same.

## [0.18.2] - 2026-10-13

**Reads:** the same as 0.18.0 — layout documents of schema **9.19.x** and themes of theme contract **4.0.x**, icon set 1.0.0.

### Fixed

- **An image in a stack was narrower than the stack.** A layer of a `Stack` is aligned by the stack (`alignHorizontal`), so its cell shrank to the natural width of the image file; with a named height (for example from `styleOn`) the image then stopped at the width of the file on a wider screen. The width of an image is given by its parent and the size of the file is never read, so an `Image` layer without its own `style.width` now takes the whole stack width. A named width still follows the alignment of the stack.
- **A streaming server renderer sent a placeholder instead of the screen.** In the HTML of the Next.js App Router (`next dev`, `next build`, statically prerendered pages) and of `renderToPipeableStream` / `renderToReadableStream`, the screen came behind a `Suspense` boundary: the first part of the response held `This screen is not available right now.` with `role="alert"`, and the screen itself followed as a hidden segment that a script moved into place. With JavaScript off, and to a crawler, the page showed only the notice; with JavaScript on, the notice was in the DOM before the screen. The component no longer puts a `Suspense` boundary around the screen: the first screen is in the first part of the response as ordinary HTML, and nothing is swapped in. `renderToString` was not affected.

### Changed

- **A screen that throws while rendering on the server** still does not fail the response (status 200, the rest of the page is rendered, the notice or `renderError` is in the markup), but it is now contained without `Suspense`. Three things you may notice: `renderError` receives the message of the exception on the server too (it used to receive a fixed text there); the notice in the server markup sits in a `<div data-hl-failed>`; and what was drawn before the failing part is in the markup, hidden by a new rule of the package stylesheet. If you ship `@hotlayout/react/styles.css` yourself, update your copy.
- **`loadDocument` and `loadTheme` check the kind of the file.** A JSON object without `schemaVersion` and `screens` is no longer returned as a document, and one without `themeContractVersion` and `themes` is no longer returned as a theme: both reject with `HotlayoutLoadError`. A theme at the document's address (or the other way round) is named as such in the message. A response that is not JSON now says what the server answered — the status and the content type — which is how a single-page application's HTML fallback for an unknown path looks. The content is still not validated.

### Documentation

- "Server rendering and Next.js" states what is in the first part of the response and what a reader without JavaScript sees.
- "Reports" lists what is reported and what is not. An image address the policy refused is reported (`ignored-input`); an image with no address, an asset token without a URL and an image that failed to load draw the placeholder without a report — the earlier wording, "no fallback is silent", promised more than that.

## [0.18.1] - 2026-10-13

Documentation only: the README opens with what the package is, how to install it and the quick start; what each schema minor added is a table under Versions. No code changes.

**Reads:** the same as 0.18.0 — layout documents of schema **9.19.x** and themes of theme contract **4.0.x**, icon set 1.0.0.

## [0.18.0] - 2026-10-13

The first version published to npm: `npm install @hotlayout/react`.

**Reads:** layout documents of schema **9.19.x** and themes of theme contract **4.0.x**, icon set 1.0.0. This is the second half of the reader of 9.19: **all six themes of the minor are now performed**; nothing of 9.19.0 is left out. Every new field is optional, and a document without them is drawn exactly as before.

### Added

- **Write actions and choice from own nodes**. `setValue` and `toggleValue` are performed by the reader with the very write an input field makes: the analytics event of the action first (once per press, also when nothing is written), then the write into the session of the reader and to `onWrite(path, value)` with a typed value, through the same gate (`writablePaths`, the form of the path, no `__proto__` / `constructor` / `prototype` segment). `onAction` is never called for them. The path and the value are literals of the document: `paramBindings` and `carryRecord` are not read. The number is read by the parser of the number field, an empty number writes the empty string; the same value is not written twice (equality by type, `""` equals an absent value); `toggleValue` writes the negation of what is shown. An invalid action (`missing-path`, `path-too-long`, `unknown-value-type`, `not-a-flag`, `not-a-number`) writes nothing, is not handed to the host and is reported as `ignored-input`. On the finished screen a node with `setValue` and a value is an option (`role="radio"`, `aria-checked`, `aria-posinset` / `aria-setsize` among the SHOWN options of one parent that write the same path), a node with `toggleValue` is a toggle (`aria-pressed`); a `setValue` that clears and an invalid action are plain buttons. The state is recomputed from the data on every render, no look of «chosen» is added (the `styleWhen` of the node gives it). It works on a button, an icon button, a list row with an action and a pressable container; a disabled button writes nothing and sends no event; the row of a `ChoiceGroup` keeps the role and the state of its group. New modules `write-action.ts` and `render/choice.tsx`; the blocks `x-actions.write`, `x-choice` and `x-conditions` are mirrored whole. `isEmpty` / `isNotEmpty` judge the value under a path of any type (already so in 0.16).
- **The parts of a list row**. `trailing.style` and `trailing.styleWhen` (the colour and the typography of the trailing text; the first state that holds lies over the base per key; a key whose token the theme does not know is skipped), `trailing.caption` with `captionStyle` / `captionStyleWhen` (one line under the text, translated under `trailing.caption`; an empty one takes no room; the column of text over caption is pressed to the end of the row and never shrinks), `leading.color` and `leading.tile` (a square of 24…96, 40 without a number, tinted, rounded, the glyph keeps its size in the centre and is clipped by the tile), `titleMaxLines` / `subtitleMaxLines` (1…5, an ellipsis at the logical end of the last line; the whole text is still heard). The row moved out of `render.tsx` into `render/list-tile.tsx`; the rules are in `part-style.ts` and `list-tile-parts.ts`.
- **The parts of a text field**. `fieldRadius`, `fieldBackground`, `fieldBorderColor`, `fieldBorderWidth` (1…4) lay over the box of the field itself, not of the node; `fieldHeight` (32…120) is the exact height of the box of a one-line field (a multi-line field does not read it); `prefix` / `suffix` — a text (the first eight code points of the shown text) or an icon at the logical start / end of the box by the direction of the SCREEN (the content direction of a mail or a number is unchanged); a mark is never the value, never written, a press on it focuses the field, its text is part of the description of the field; `counter: true` with `maxLength` draws `count / max` (code points of the shown text, ASCII digits) at the logical end of the row under the box, read with the field and not announced on every key. The field moved out of `render.tsx` into `render/text-field.tsx` and was split into small functions; the rules are in `input-parts.ts`.
- **`alt`, an icon from data, date parts, `unset`**. `alt` of an image and of an icon is a plain string or a string of the document (a binding, a template, a wrapped literal), translated under the key of the field (`<screen>/<node>/alt`), under the rule of shown text; an empty result makes the picture decorative. `iconPath` beside the icon of `Icon`, `Button`, `Badge`, `IconButton` takes the NAME of an icon from the data: a name of the embedded set is drawn (and mirrored in a right-to-left screen by the resolved name), a name outside the set and a value that is not a string are an empty box of the same size, nothing from data reaches a style, an address or an attribute; a node without an icon in the document does not read the path. `dateParts` (`dayMonth`, `weekdayDayMonth`, `dayMonthYear`) beside `format: 'date'` selects explicit options of `Intl.DateTimeFormat` (`date-parts.ts`); on any other format it is ignored. `unset` in `styleOn` and `propsOn`: for each layer from the narrow one the named fields are removed first, then the layer is laid on; in properties only `Screen.contentMaxWidth` can be removed (`width-unset.ts`).

### Fixed

- **A carousel row that is a pressable card** (a `Row` with `scrollable` and `carousel` and an `action`) now carries the hidden `label` first and keeps the role of a card; it was `role="list"` without a name. The hidden label is not a card and gives no stop to the dots.

### Changed

- `render.tsx` lost the list row and the text field (they live in `render/list-tile.tsx` and `render/text-field.tsx`); the node passes the place of an option in its group to its widget (`WidgetProps.choice`) and the children of the node to its own children (`SiblingNodesContext`).
- The attribute `data-hl-glyph` of an icon whose name came from data is written only for a name of the set.

## [0.17.0] - 2026-10-13

**Reads:** layout documents of schema **9.19.x** and themes of theme contract **4.0.x**, icon set 1.0.0. This is the first half of the reader of 9.19: **three of the six themes of the minor are performed** (the pressable container with free composition, money as money, the top of the screen); the other three are NOT yet (see below), and a document that uses them is drawn as its 9.18 reading — every new field is optional and is skipped.

### Added

- **Free composition and the pressable container**. `action` and `label` on `Column`, `Row`, `Container` and `Stack` make the box a button: `role="button"`, `tabIndex 0` and the focus ring, before its own controls in the order of focus; Enter and Space press it, the auto-repeat of a held key does not. The action is the action of a `Button` — the same parse and catalog, `track` once before the action, `carryRecord`, the same `onAction` / `onNavigate`, the record of the list row the card is drawn in. A press goes to the innermost control under the point (another card, a button, a list row with an action, a choice option, an input with its whole box, the strip of tabs, the header of an accordion); the ancestors of the control that took it get nothing — no action, no event. A disabled button inside swallows the press. A card whose action is `none` is a card only when it carries analytics. The name is the `label` — a visually hidden text that comes first, not `aria-label` — and then the content; the label obeys the rule of shown text. There is no pressed state, no disabled state and no extra touch target. A card inside a card is not published; if it arrives the innermost one gets the press. A type in its own type and a tree of up to eight levels need no code and are drawn.
- **Money as money**. The fields `currencyDisplay: 'symbol'`, `currencyPosition: 'before'` and `sign: 'always'` of a binding (a lone binding and a value of a template). Without a readable field the text is exactly as before. With one the binding is written in one order in every language — the sign of the number, the currency before, the amount, the currency after: the minus is U+2212 and the plus U+002B (written by the reader, not by `Intl`), zero has no sign, the sign of the currency comes from the closed table of twelve codes (a code it lacks is shown as the code, in the same place), the place of the currency does not depend on the language. In text shown right to left the composed form is wrapped in U+2066 … U+2069. `Text.spans[place].parts` (`fraction`, `currency`) styles the decimal separator with its digits and the currency with its gap; a part without a style merges with its neighbours, a declared part enters the strut of the paragraph under `place.part`, a font the theme does not know leaves the font of the place. The new module `money.ts`; `templateRuns` now yields the pieces of a number (the text is unchanged).
- **The top of the screen**. `Screen.props.bodyTop: 'screenTop'`: the body area starts at the top edge of the screen and the app bar stands over it in its place (the zone of the bar has no height, the box of the bar takes the presses, the side paddings of the root next to it let them through to the body); nothing above the first child of the body, no backdrop under a sticky bar, a pulled first child raises nothing, a screen whose zone is taken by the own strip of a navigation bar ignores the word. An unknown word (and the non-existent `belowBar`) is no field. The new prop **`safeAreaTop`** (`number | 'env'`, default `'env'`): the inset is added inside the box of the app bar above its content (a named background covers the status bar), without an app bar above the body area, inside the own strip of a navigation bar; only with `scroll="screen"` or while the bar is stuck, never in a modal layer; a number that is not clean (negative, `NaN`, infinity, a string) is `0`. The root carries `data-hl-body-top` when the word is in force.

### Changed

- `HotlayoutScreen` reads the anatomy of the host from one object (`render/anatomy.ts`); the paragraph of a composed text moved to `render/rich-paragraph.tsx`. No behaviour changed.

### Not yet (the other half of 9.19)

The write actions `setValue` / `toggleValue` and the choice built from own nodes; the parts of a list row and of a text field (trailing text, caption, leading tile, `titleMaxLines`, the look of the field box, `prefix` / `suffix`, `counter`); `alt` as a document string, an icon name from data, date parts and the explicit `unset` in a width layer. The class of silent characters of an accessible name is already the wider expression of 9.19.

### Known edges

- A carousel row (`Row` with `scrollable` and `carousel`) that is a card does not carry the hidden label (its name is its content).
- The pressable card is a `div` with `role="button"`, not a `<button>`: a button cannot hold controls.

## [0.16.2] - 2026-10-12

**Reads:** the same as 0.16.1 — layout documents of schema **9.18.x** and themes of theme contract **4.0.x**, icon set 1.0.0. The package follows the clarifications of 9.18.0 made before its release.

### Changed

- **Shown text applies to all four texts of an input field.** The label, the hint inside the field (`placeholder`), the note (`helper`) and the error text are shown with runs of space, tab, LF and CR collapsed and the edges trimmed; U+00A0 stays; the VALUE of the field is never touched. Text nodes are collapsed by CSS as before; the `placeholder` attribute and the `aria-label` of an icon button are not, so the package collapses them with `shownTextOf` (`shown-text.ts`, a mirror of the reference). `white-space: pre` stays only on the value of a multi-line field and on the label of a ring and a bar.
- The block `x-style.layout.widthClass` is mirrored with its new key `olderReader.showOnLeadingZone`; the block `x-style.layout.shownText` is mirrored whole.

### Internal

- The root of a screen (`useScreenZones`, the zones, the content column) moved from `render.tsx` to `render/screen-root.tsx`, the contexts to the leaf module `render/contexts.ts`; no behaviour changed.

## [0.16.1] - 2026-10-12

**Reads:** the same as 0.16.0 — layout documents of schema **9.18.x** and themes of theme contract **4.0.x**, icon set 1.0.0. No document is drawn differently: the pixels of every screen are the same (measured in Chrome before and after, 24 frames byte for byte). Five defects of the adaptive layout are fixed.

### Fixed

- **The lock against a width-class loop could stay forever, and did not see a loop of three classes.** 0.15.0 locked the class after four switches A → B → A → B with gaps of at most 100 ms and kept the narrower one "until the width falls into a third class". An honest jitter of a window edge over 600 or 1024 was locked the same way, and a window that then rested at 900 was drawn `compact` for good (at 1440 — `medium`); a root as wide as its content with three nodes of 700 / 1100 / 300 on one class each went round compact → medium → expanded and was repainted on every frame for as long as the page was open. The rule is now (`width-class-lock.ts`; a rule of the package, not of the contract):
  - a loop is recognised **by the return, not by a pattern**: four changes of the class within 500 ms. With three classes the fourth change in a row always returns to a class already shown, so a loop of two and of three is caught alike; a loop makes a change per repaint, a person does not cross a boundary four times in half a second on purpose;
  - the class becomes the **narrowest** of the classes of the loop and is locked;
  - **the lock is lifted when the width of the root changes under it** (by more than half a pixel): under the lock the layout is constant, so a new width comes from the host, not from the content. The class is taken from the new width; a loop that starts again is locked again, and every lift is paid for by a real change of the width;
  - a jitter at a boundary is told from a loop by the width under the lock (it is not the width the "loop" showed for that class). Such a lock is also lifted by itself after one second if the width never changes, by a single check that takes the class from the measured width; a real loop is then locked a second time and is not checked again.

  A zero measure still means "unknown", and `initialWidthClass` still holds until the first measure.
- **A change of the class rebuilt the body of the screen.** The screen root had three shapes of markup (no zones; with zones; with the content column), and the body stood at a different depth in each. `propsOn.medium.contentMaxWidth`, an app bar or a pinned block with `showOn: ['compact']` changed the shape between classes, and React threw the body away and built it again: the text field was another element, the focus fell to `<body>`, an unfinished IME composition was gone, an expanded `Accordion` collapsed — against "switching the class keeps the focus" of 0.15.0. The root now has **one shape** on every class and with every combination of zones: root → body zone → body padding → content column → children; the zones of the app bar and of the bottom are present or absent beside it, and the pinned block always stands in a content column too. A class changes styles only. A guard draws every screen of every contract fixture in the three classes and compares the path to every node of the body, and the identity of the elements after a live change.
- **The focus on an item of the navigation bar was lost when the bar moved.** The items in the bottom bar and in the app bar are different places of the markup, so their buttons are built again; an item that had the focus now has it again in the new place (only when the focus was really lost, not when it went elsewhere).
- **`showOn` on the screen root was obeyed.** The contract gives the field to every node but the screen root; a root with `showOn: ['expanded']` drew an empty screen on a phone, and a modal layer (the class of its content comes from its own box, so it is always `compact`) with `showOn: ['medium', 'expanded']` left nothing but the scrim on every width. The reader no longer reads the field on the root.
- **The view of the items in an app bar with `titleAlign: 'start'` depended on the view before.** The natural width of the title was read as the `scrollWidth` of its line, which is never less than the box of the line; with `titleAlign: 'start'` the title zone takes all the room that is left, so with the labels hidden the title "measured" a hundred points wider and the labels did not come back until the bar was that much wider — two views at one width. The measure now reads the width of the **text** of the title (an inline element around it), which does not depend on the zone.

### Changed

- **Markup of the screen root** (hooks for tests, not a promise): a screen without zones now has `data-hl-zone="body"` too; the children of the body and the pinned block stand in an element with `data-hl-content`; the padding of the root that goes to the body is on the parent of that element, as four logical sides. The text of the title and of the subtitle of the app bar is wrapped in an inline `data-hl-title-text` element — the styles of the line stay on the line.

### Internal

- `ScreenRootView` went from 256 lines with three `return`s and a cyclomatic complexity of 67 to 33 lines with one `return` and a complexity of 7: the zones are one hook (`useScreenZones`, one call of `screenChromeIn`), the frame of the screen one function (`screenFrameOf`), the zones of the app bar and of the bottom and the content column are components.

### Not read yet

- The inside of an **app bar** still has two shapes of markup (with `contentMaxWidth` its zones stand in an inner column): a class that turns the field on rebuilds the leading node and the actions of the app bar, and a focus on one of them is lost. The body is not affected.
- Safari and Firefox were not measured; the lock and the focus were checked in Chrome and in jsdom.

## [0.16.0] - 2026-10-12

**Reads:** layout documents of schema **9.18.x** (step 2 included) and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.17 document is read and drawn exactly as before on `compact`, and the document is not changed by step 2: the place of the navigation bar and the shape of a modal sheet are chosen by the reader from the width class. A document with `widePlacement: 'bottom'` keeps the bar at the bottom on every width.

### Added (schema 9.18 — adaptive layout by width, step 2: the wide place)

- **Navigation bar at the top on `medium` and `expanded`** (`NavBar.widePlacement`: `top` or `bottom`, absent or unknown means `top`; on `compact` the bar is always at the bottom). One question decides where every screen stands (`screenChromeIn`): the bar goes **into the app bar** when the screen has an app bar that is shown in this class and by its own condition, otherwise it is a **bar of its own** in the zone of the app bar. An app bar hidden by `showOn` or `visibleIf` is not waited for; a bar hidden the same way is drawn nowhere; a bar that is not the last child of the root stays an ordinary child of the body.
- **Items in the app bar.** The items are part of the trailing zone, before the actions (reading order: leading node, title, items, actions; the gap between items and actions is the gap of the app bar). The rule of 9.9 – 9.16 for the zones is unchanged: the title is centred on the bar until it would meet a zone, then moves exactly as much as needed; the leading node is not wider than half the bar. The bar has no box of its own there — the background, border, padding, shadow, radius and size of the `NavBar` node are not read; its named colour and font are inherited by the items.
- **An item at the top** is an icon and a label side by side, natural width (padding `sm` / `md`, gap `xs`, label in `bodyM` on one line, at most 160 wide, then an ellipsis), no equal shares. Colour, the active item, the press and the semantics are those of the bottom bar; `navigate.section` works exactly the same.
- **A bar of its own** is fixed at the top (the body scrolls under it), edge to edge, without the padding of the root, with the built-in background `surface` and a 1 px line of `border` at the **bottom** (a named `style.background` / `style.border` replace them); the items start at the start of the row, inside the content column when `contentMaxWidth` is named. The top padding of the root stays with the body, inside the scroll. In a block without an own height it sticks like the app bar (`chrome: 'sticky'`).
- **When it does not fit**, in this order: the title shrinks down to 120; the labels of all the items are hidden together (an item is then icon-only; the label stays in the markup as the accessible name); the title shrinks to nothing; the leading node gets what the items and actions left; the end of the bar is clipped. Icons and actions never shrink. The view is decided by the reference (`wideAppBarZones`, `wideNavBarOf`) from **natural** widths only (the `scrollWidth` of the title and of the labels — for the title, the width of its text since 0.16.1), so the view cannot flicker; a zero measure (the server, a root without layout) means "unknown" and keeps the labels shown.
- **Zones of a wide screen** (`wideScreenZonesOf`): with the items in the app bar the bottom zone is only the pinned block, and without it there is no zone and the reader adds no safe inset; a bar of its own takes the top and the rest is laid out as on a screen without an app bar.
- **A modal sheet is a window in the middle on a wide place.** A modal screen without `modalPlacement` (or with `bottom`) is a sheet on a `compact` area and a window on `medium` / `expanded`: width = the area minus the `xl` margin on both sides, at most 560; height by content, at most the lesser of 85 % of the area and the area without margins; centred on both axes; the body scrolls and the header of the layer stays; the pinned block stays at the bottom of the window; no safe inset. `modalPlacement: 'center'` is the window of 9.9 on every width. A bottom corner of the root radius that the document did not name takes the radius of the top corner of the same side (`sheetWindowRadius`); a named corner, zero included, and a single value for all corners stay as they are.
- **The class of the content of a layer comes from its own box** (a 560 window is `compact`, so the tree inside the window is drawn as written for a phone), while where the layer stands is decided by the class of the area the host gave the screen. A page under the layer keeps the class of the area.
- `data-hl-shape` (`sheet`, `window`, `sheetWindow`) on the modal layer, `data-hl-zone="navTop"` on the own bar, `data-hl-nav-group` / `data-hl-nav-mode` on the items in the app bar: hooks for the host's tests, not a promise about the markup.

### Changed

- A screen with a navigation bar at width `medium` and above no longer draws the bar at the bottom. Hosts that want the old look on a wide place set `widePlacement: 'bottom'` in the document.
- The package test that forbids touching `window` in the sources no longer counts quoted words, object keys and member access (`rules.window.margin`): `window` is now also the name of a layer shape.

### Fixed

- **A tap on the dim area outside a modal layer did not close it in a real browser.** The area of the layer lies over the scrim and covers it entirely, so a tap beside the window landed on the area, not on the scrim (jsdom does not hit-test, and `fireEvent.click` on the scrim hid it). The area no longer takes pointer events; only the sheet does. A structural test guards it.
- The view of the items (labels or icons only) is measured again when a font finishes loading: a font changes the natural width of the labels without resizing the bar, and a measure that waits for a resize would keep a stale view.
- **Theme spacing no longer sits inside CSS math in the step-2 code.** The gap between the items and the actions of the app bar, and the margin of the window-shaped sheet (`xl`), were written as `calc(var(--product-space-…) …)`; a token equal to a bare `0` made the whole declaration invalid. They now use the numbers of the theme (`spacingMathCss`), like the rest of the package.

### Not read yet

- Pixels of the zones and of the window are measured in a real browser, not in the tests (jsdom has no layout).
- When the end of the app bar is clipped, the clip is at the edge of the padding box of the bar (the padding of a bar that has its own box is not subtracted from the clip).

## [0.15.0] - 2026-10-12

**Reads:** layout documents of schema **9.18.x** and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.17 document is read and drawn exactly as before: every field of 9.18 is optional and has no default, and a document without them draws the same first frame at every width.

### Added (schema 9.18 — adaptive layout by width, step 1)

- **Width class.** `compact` (below 600), `medium` (600 and up) and `expanded` (1024 and up), measured from the width of the root element of the package (`ResizeObserver`; the width is not rounded: 599.9 is `compact`). Not the window, not the device. One class per screen; a modal layer takes the class of the root for now. Until the root is measured (the server, the first frame, a root without layout) the class is `compact`.
- **`initialWidthClass`** prop: the class to draw until the root is measured. A host that knows the width of the place (a desktop site) passes it, so the server markup and the first browser frame already have the final layout and nothing jumps after hydration. An unknown value counts as `compact`. After the first layout the measured class wins.
- **`showOn`** on any node but the screen root: shown when the class is listed AND `visibleIf` holds. One answer to "is it visible" everywhere the reader asks: screen zones (app bar, pinned block, navigation bar), actions of the app bar, items of the navigation bar, numbering of list items, tabs, `required` fields of a form, layers of a stack, cards of a carousel, rows of a weighted row. An unknown class word is skipped; with no known word left the node is shown.
- **`styleOn`** (`medium`, `expanded`): the style of a node per class, merged field by field of the top level in the order `style` → `medium` → `expanded` → the first matching state of `styleWhen` (a state is stronger than a width layer). Every value goes through the same checks as `style`.
- **`propsOn`** for `Screen`, `Column`, `Row`, `Container`, `Grid` and `Repeater` with the closed list of keys of each type; `columns` in an override is 1…6 (the base stays 2…4), `carousel` overrides `perView` only and only where the base is a carousel. A key outside the list, a layer or a value of a wrong shape does not touch the base. The rules about props (who accepts weights, the main axis, the number of columns) hold in every class with the effective props: the package resolves the tree for the class before drawing.
- **`Screen.contentMaxWidth`**: the content of the body, of the pinned block, of the app bar and of the navigation bar is a column no wider than the number, centred, the same in both writing directions; the background of the root and of the bars stays edge to edge. A screen narrower than the number does not change.
- Switching the class (the width of the host changes) keeps the stack of screens, the choices and the typed values of the fields, the memory of the carousels and the focus; only the layout is redrawn.
- A root that has no width of its own (a shrink-to-fit parent) could make the class depend on the content it draws. Four switches in a row between two classes without a pause stop the class at the narrower one until the width falls into a third class; give the host element a width to avoid it. *(This rule was replaced in 0.16.1: it could stay locked forever after a jitter of the window edge and did not see a loop of three classes.)*

### Fixed

- **A pulled first child of the body raises the body area when the screen gap is `none`.** The overlap (`pull − gap`) was written as `calc(56px - var(--product-space-none))`; the theme variable of `none` is a bare `0` without a unit, so the whole expression was invalid, the declaration silently dropped and the computed `margin-top` / `padding-top` stayed `0px` (with `scroll="screen"` the node was clipped at the bottom edge of the app bar). The overlap is now computed from the NUMBERS of the theme in logical pixels, the way the builder canvas does it.
- **The same class of mistake, everywhere a theme length goes into `calc()`, `max()` or `min()`:** a bare `0` (the token `none`, a theme token of value 0, a numeric 0) is not a length, and one such operand makes the whole math expression invalid. Resolved to numbers with a unit (`spacingMathCss`, `mathLength` in `resolve.ts`): the safe-area padding of the pinned block, the width of a leading-zone node (`50cqi + gap`), the width of a carousel card, the width of a full-width button and of a node in a column (margins), a node's own `margin` under `pull`, the negative offset of a layer (`calc(-1 * token)`), the min-width of the text field, the scroll margin of a field, the side of a list-tile thumbnail, the segmented progress (step gap, gradient shift), tab title padding, and the gap a `justify: center | end` host hands to the stylesheet (`--hl-gap`). A test over all fixtures at the three width classes — as they are and with every spacing token replaced by `none` — fails if any style the package writes has a spacing variable inside a math function.

### Not read yet

- The navigation bar and the modal layer on a wide screen behave as in 9.17 (step 2 of the minor): the bar stays at the bottom, the layer is a sheet or a window as before. A modal layer takes the class of the root, not of its own box.
- Inline borders of an app bar or a navigation bar are not subtracted when `contentMaxWidth` centres their content; the box of the bar is edge to edge and its content is a column of its own content box.
- The pixels of the columns and of the grids are measured in a real browser, not in the tests (jsdom has no layout).

## [0.14.0] - 2026-10-12

**Reads:** layout documents of schema **9.17.x** and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.14 document is read and drawn exactly as before: every field of 9.15, 9.16 and 9.17 is optional and has no default, and a document without them has no marker, no emphasis and no free space to distribute.

### Fixed before release

- Numbered list items that are layers of a `Stack` or cards of a scrolling `Row` with `carousel` are numbered as siblings (1., 2., 3.). The group is the run of children of one parent, whatever the parent is; these two parents draw their children themselves and every item used to be "1.".
- A numbered item pinned to the bottom (`pin: 'bottom'`) is numbered with its siblings: the group is counted once over all children of the screen root, by the document, so a pinned item gets its own number and the marker column of every item of the group is as wide as the whole group needs.
- Numbering of a list is one pass over the siblings instead of a search for the bounds of the group for every child (10 000 numbered items used to take about ten times longer than the same bulleted items); the numbers and column widths are identical to the reference on every row of the shared table.
- A row container with `style.minHeight` and no named height keeps the children in the band of its tallest child, from the start of the box: the box carries the minimal height, a nested element lays the children out. A named `style.height` is unchanged.
- `justify: center | end` without free space no longer moves the children against the axis: the start of the content is never cut off. Done with auto margins on empty pseudo-elements in the stylesheet (negative margin takes back the `gap` next to them), not with the keyword `safe`, which Safari 16 does not support in flex layout. Applies to `Column`, `Container` (both directions), `Screen` and `Row`; a wrapping `Row` keeps the plain word (every line shares its own free space). Hosts that ship `styles.css` themselves must ship the new rules.
- A child of a column host no longer shrinks below its own size (`flex-shrink: 0`): a named height is exact and a child taller than the box keeps its size, as in the reference.
- The node in the leading zone of an app bar with a `style.minWidth` larger than half of the bar is clamped to half the bar like a named width: the zone limit beats the minimal width of the node.

### Added (schema 9.15 — alignment on both axes)

- **`Column.justify`, `Container.justify`, `Screen.justify`** (`start`, `center`, `end`, `between`) and **`Container.align`, `Screen.align`** (`start`, `center`, `end`). `justify` is `justify-content` on the flex of the host; `align` of a row container is `align-items` (the vertical axis, centre without the field, as before); `align` of a column container and of a screen is the cross alignment of the column rule the package already honoured. The free space of the main axis exists only where the contract names a source (`style.height`, `style.minHeight`, or a layer stretched over its stack; the body of a screen is its scroll area minus the scrolled length): a column of the height of its content distributes nothing, and that is not an error. `gap` stays the smallest distance, `between` with one child is `start`, nothing is rounded. A word the reader does not know reads as no field and never reaches `style`.
- `alignment.ts` (internal): the reference functions of the contract (`alignedChildRects`, `mainAxisShifts`, `columnHeightSourceOf`, `screenBodyFreeSpace`) and the mirror of `x-style.layout.alignment`.

### Added (schema 9.16 — an app bar assembled from a mock-up)

- **A node in the leading zone of an app bar:** the first child of an `AppBar` that carries `zone: 'leading'` (a `Button` or an `IconButton`) replaces the built-in back arrow whatever `showBack` says; hidden by its condition it gives the zone back to `showBack`. It is an ordinary node (role, size, icon beside the text, own style, translation, `track`, its own action; there is no built-in "back" in it) and is not one of the two actions. Its width is natural or named, at most half of the bar (`50cqi`: the bar is a size container); the title is shortened first, the actions never. A second node with the field is not drawn anywhere, a button with a label **without** the field is still not drawn.
- **`AppBar.titleAlign: 'start'`:** the title block stands right after the leading zone (`max-content · 1fr · max-content`), lines from the start; no field, `center` and any other word keep the 9.9 grid and the title in the middle.
- **`glyphSize`** on `Icon` and `IconButton`: an integer 8…128, the side of the drawing in logical pixels. It beats the word `size` and `style.typography`, is not multiplied by the system font scale, makes the box of the widget grow with it and, when `style.width` / `style.height` is named, is clamped by the content box. Anything else reads as no field.
- `glyph-size.ts` (internal), and the leading-zone functions and mirrors of `x-style.layout.appBarLeading`, `appBarTitle` and `ownGlyphSize` in `media-chrome.ts`.

### Added (schema 9.17 — text emphasis, list items, the label of a ring)

- **`style.fontStyle`** (`normal`, `italic`) **and `style.textDecoration`** (`none`, `underline`, `lineThrough`), inherited field by field like the colour and the font, read by `Text` only (a button, a badge, a list row and the rest keep their own look). They travel as a value in the foreground context, never as CSS on a wrapper, and the line is drawn by **each run itself**: a part with `none` cancels the line of its text. `normal` and `none` are real words that cancel what is inherited; an unknown word (`overline`) is no field.
- **`weight`, `fontStyle`, `textDecoration` of a part of a text** (`Text.spans`): a part that names only emphasis is a part. The weight is a word (`regular` 400, `medium` 500, `semibold` 600, `bold` 700) and beats the weight of the font style of the part and of the text. The strut of the paragraph and the merging of runs (by place, not by look) are unchanged.
- **`Text.marker`** (`bullet`, `number`): a column of the font size of the text (one for a dot; `max(1, 0.6 × digits + 0.4)` for a number, the digits being those of the **group size by the document**), a gap of half a font size, the text in the rest of the width with a hanging indent, aligned to the first baseline. The sign is drawn in the base font and colour of the text, without italic or line, pressed to the end of its column; a dot is `aria-hidden`, a number is heard before the text. The number is the count of **visible** items of a group of consecutive neighbours with `marker: 'number'` (any other node, hidden or not, breaks the group); the digits follow the formatting language of the document. A numbered template directly under a `Repeater` counts the drawn instances.
- **`CircularProgress.labelTypography` and `labelColor`:** the style of the label of a ring, by the same rules as `style.typography` and `style.color`. A field of a wrong shape or a token the theme does not know gives the built-in `caption` / `onSurface` as a whole. The label does not scale with the ring, does not inherit anything from the node, does not size the ring and is not clipped by it (one line, centred).
- `text-emphasis.ts` and `list-marker.ts` (internal), `RING_LABEL_STYLE` in `progress.ts`, `zone` in the node shape.

### Not done

- Emphasis in the label of a button or a badge, a link in a part of a text, a custom marker sign and nested list levels are not part of 9.17. The pixels of the app bar zones, of the drawings and of the markers are measured in Chrome, not in the tests (jsdom has no layout).

## [0.13.0] - 2026-10-10

**Reads:** layout documents of schema **9.14.x** and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.13 document is read and drawn exactly as before: every field of 9.14 is optional, and a document without them has no asterisk, no disabled button and no number field.

### Changed (for TypeScript hosts)

- **The type of the value of `onWrite` is widened again:** `(path: string, value: string | boolean | number) => void`. A **number field** writes a JSON number, or the empty string `""` when the typed text is not a number or the field was cleared (never `null`). A host that stored every value as a string or a boolean must handle the number now (TypeScript will tell you). `writablePaths` is unchanged.
- **A `ChoiceGroup` with a bound value now also writes to the session of the reader** (it wrote only to `onWrite` before), exactly like a field: `visibleIf`, `disabledIf` and a button that waits for a filled form react at once, without your `data` coming back. Choosing the option already shown writes nothing. What `onWrite` receives is the same as before.
- **A comparison of an empty string no longer holds** (`gt`, `gte`, `lt`, `lte`): `Number("")` is zero, so a cleared number field (it writes `""`) used to satisfy `lt 16`. An empty text, or one made of spaces only, is not a number for these four operators.

### Added (schema 9.14 — a form for a survey)

- **`required`** on `TextField`, `Checkbox` and `ChoiceGroup` (the literal `true` only): an asterisk after the label (`danger`, `aria-hidden`, not part of the accessible name) and `aria-required` (on the `<input>` / `<textarea>`, the `role="checkbox"` button, the `radiogroup`). The renderer shows no text of its own and never puts a field into the error state because it is empty.
- **A form is the screen** (the header, the body, the pinned block and the navigation bar of one `screens[]` entry; a modal layer is its own form). A field counts as filled by the **value under its path** read through the layers of the reader (the record of the screen, what the user typed, the data of the host): a text that can be heard, a finite number, `true`, a non-empty choice (the `fallback` of the binding counts). A field hidden by `visibleIf` (its own or of an ancestor), disabled by `disabledIf`, or inside a `Repeater` is not counted; a field in a tab that is not open is. A field without a path is never filled.
- **`requiresFilled`** and **`disabledIf`** on `Button` and `IconButton`: the button is disabled while the form of its screen is not filled, or while the condition holds. Disabled: opacity 0.5 on the whole widget (multiplied with `style.opacity`), `aria-disabled="true"` (not the `disabled` attribute: the button stays in the tab order), no press feedback, and touch, click, Enter, Space and auto-repeat do nothing — no `onAction`, no `onTrack`, no navigation. It is recomputed on every write, with the first letter.
- **`TextField.valueType: 'number'`**: a number field — one line, `inputmode="decimal"`, content left to right (`keyboard` and `lines` are not read). The typed text is parsed by the contract's own rule (`parseInputNumber`: a minus, digits of three scripts, one separator `.` `,` `٫`, at most 15 digits, no groups, no exponent; `5.` and `.5` are numbers; `-0` is `0`), not by `Number()`. A number in `data` is shown as plain ASCII digits with a dot; a string under the path is an empty field; the field keeps the typed text while its number is the number of the layers ("36,6" stays).
- **A number field with a non-number is in the error state**: when the field is not focused and the shown text is not empty and is not a number, it looks exactly like a field with a non-empty `error` from the data (error border) and has `aria-invalid="true"`. No text is added (the `helper` stays, with its own colour); no state while focused, and none once the text is a number or empty. The shown text is judged, so a number that came back in `data` clears it. Server rendering never shows it: there is no focus and no typed text on the server.
- `form-rules.ts` (internal): the reference functions of the contract and the mirror of `x-style.layout.form`.

### Fixed

- A 9.14 document was drawn with a button that was always enabled and a number field that wrote a string to a number path.

## [0.12.0] - 2026-10-10

**Reads:** layout documents of schema **9.13.x** and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.12 document is read and drawn exactly as before: a document without input widgets has no fields, no session and no writes.

### Changed (for TypeScript hosts)

- **The type of the value of `onWrite` is widened:** `(path: string, value: string | boolean) => void` (it was `value: string`). A `TextField` writes a string, a `Switch` and a `Checkbox` write a boolean; a `ChoiceGroup` still writes a string. A host that stored every written value as a string must handle the boolean now (TypeScript will tell you). `writablePaths` is unchanged and applies to the fields exactly as it did to the choice group.

### Added (schema 9.13 — the input widgets)

- **`TextField`** — a visible `label` (the accessible name, `<label for>`), `placeholder`, `helper` and `error` (any string of the document, usually a binding to a path your `data` fills; a text that can be heard puts the field in the error state: red border, `aria-invalid`, the text replaces the helper, announced politely). `keyboard` (`text`, `email`, `number`, `phone`, `url`) sets `type` / `inputmode` / `autocomplete` / `autocapitalize` / `spellcheck` from the data of the contract; `number` is a keyboard, not `type="number"`; there is no password. `maxLength` counts Unicode code points and cuts the input (the browser `maxlength` is not used); `lines` 1–8 makes a `textarea`. The content of email / phone / url / number fields always runs left to right, the alignment follows the screen. The key action of the keyboard is "next" (focus moves to the next field of the screen) or "done" (blur); it never performs an action and there is no form to submit.
- **`Switch`** (`role="switch"`, the control at the end of the row) and **`Checkbox`** (`role="checkbox"`, the box at the start, the tick is the `check` icon of the set). The whole row is the target; Space toggles (Enter toggles a switch only).
- **`disabledIf`** on all three: the same condition as `visibleIf`; a satisfied condition makes the field unfocusable, silent and half transparent.
- **Writing.** The value of a field is a data path. Every change of the user is written at once, to the session of the reader (so `visibleIf` and bound texts of the same flow update at once) and to `onWrite` — no delay, no write on blur. A text that did not change is not written; a cleared field writes `""`; a composition (IME) is written when it ends; a value the platform filled before the first touch is neither kept nor written. A field without a readable path works locally and writes nothing. The session lives as long as the flow (the same `documentId` and `entry`) and gives way to `data`: when your `data` changes the value under the path, what the user typed under that path is dropped.
- **`autofill`** (prop of `HotlayoutScreen`, default `true`): `false` turns every autofill hint off (`autocomplete="off"`). Credentials, card details, postal addresses and one-time codes are never asked for, whatever the document says.
- `input-rules.ts` and `input-session.ts` (internal): the reference functions of the contract and the mirror of `x-style.layout.inputs`.

### Notes

- The value of a field is user input. Validate it on your backend; throttling the writes is yours (`onWrite` is called on every keystroke). A field hidden from the eye can still be autofilled by a browser; for a document from an untrusted source pass `autofill={false}`.
- The reader does not listen to `visualViewport`: the browser scrolls the focused field into view, and the bottom scroll margin of the body keeps it above the stuck bottom zone.

## [0.11.0] - 2026-10-10

**Reads:** layout documents of schema **9.12.x** and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.11 document is read and drawn exactly as before: a screen without a pinned block and without a navigation bar has no bottom zone, and the safe inset is added to nothing.

### Added (schema 9.12 — the bottom zone of a screen)

- **A navigation bar.** The widgets `NavBar` and `NavItem` are drawn. The last child of the screen root, when it is a `NavBar`, stands in the bottom zone, edge to edge, and does not scroll. The visible items share its width equally (no gaps, no rounding); only the first five visible ones are drawn (`navBarExtraItems`); a hidden item takes no share. An item is an icon over a one-line label cut with an ellipsis, padded `sm` / `xs`, the icon a `md` step. The surface is `surface` with a 1-pixel top line of `border`; a named `style.background` / `style.border` replaces them. The active item is `primary`, the rest `muted` (a named colour: the active as it is, the rest at the secondary opacity). The bar is a `<nav>`, an item is a button named by its label (an empty label: the name of the icon), the active one has `aria-current="page"`; every item is a tab stop, Enter and Space press, auto-repeat does not.
- **A block pinned to the bottom** (`pin: "bottom"`, the last child not counting the bar). It stands above the bar, does not scroll, takes the sides and the bottom of the root padding; the body ends with the `gap` of the screen instead of that padding and is clipped at the top edge of the zone. Its `pull` is not read. A `pin` anywhere else, or a word other than `bottom`, is not read.
- **`navigate.section`** is performed by the reader: the stack becomes the one named screen (everything above it, modal layers included, is closed); the stack that already is that screen does nothing and sends no event; a modal target is shown as a page; an unknown screen goes to the host. The screen-shown event gets the cause **`switch`** (`depth` 1, `record` `null`). `onNavigate` gets `kind: 'switch'` and may cancel it; the analytics event of the press still goes first. A section is shown from the start — nothing remembers the stack or the scroll of a section. `navigate` is unchanged.
- **`safeAreaBottom`** (`number | 'env'`, default `'env'`): the inset the reader adds under the content of the bottom zone, only when the zone exists; the background of the bar reaches the physical bottom. A string of the host goes through `sanitize.ts`: `'env'` or a number, anything else is `0`.
- **`stickyBottomOffset`**: the `bottom` the zone sticks at (same forms as `stickyOffset`).
- With `scroll="page"` the bottom zone **sticks** to the bottom of the viewport (`chrome="static"` leaves it as the last row of the block); a stuck pinned block paints the background of the root under itself, and the elements of the body that take focus keep clear of the zone (`scroll-margin-block-end`).
- `screenChildrenByZone`, `navItemSharesOf`, `bottomZoneOf`, `sectionStackOf` and the mirrors of `x-style.layout.bottomZone` / `navBar` in `bottom-zone.ts` (internal); `screenZonesOf` knows the bottom zone.

### Changed

- The mirror `SCREEN_ANATOMY` follows the artifact: the bottom zone is no longer "reserved", and the body area ends at its top edge.
- `NavigationEvent` has a third kind, `switch`; `ScreenShown.cause` can be `switch`. A host that listed the causes exhaustively must add it.

## [0.10.0] - 2026-10-10

**Reads:** layout documents of schema **9.11.x** and themes of theme contract **4.0.x**, with icon set 1.0.0. A 9.0 – 9.10 document is read as before; what changed in the way an already built document is read is listed under **Changed**. The renderer still opens nothing by itself and never touches the system status bar.

### Added (schema 9.9)

- **An own image proportion.** `Image.aspectRatio` accepts a word of the list or a pair `{ width, height }`; a pair outside 1:8 … 8:1 is clamped, and a value the reader does not understand (a word of a newer minor, a zero side, `null`, a missing field) is `16:9` (`unreadableImageRatio`). A named `style.height` is stronger than the proportion (a 56 × 56 avatar stays 56 × 56); `minHeight` / `maxHeight` clamp both; the picture lies in the box by `fit`, centred, and is clipped by the node's radius. The natural size of the file is never read.
- **App bar actions.** The children of an `AppBar` (up to two `IconButton`s, the limit is the schema's) are drawn in the trailing zone in document order; a child of another type is not drawn, a hidden one takes no room. A real button with its own name, role and style: the colour of the bar does not reach it.
- **A window in the middle.** `ScreenEntry.modalPlacement: 'center'` draws a window — the area minus the `xl` margin on each side, not wider than 400, centred on both axes, as tall as its content; anything else is a sheet.
- **A request for the status bar icons.** `ScreenEntry.statusBarIcons` (`'light'` / `'dark'`) arrives in `onScreenChange` as `statusBarIcons`, only when the screen named it; `modalPlacement` arrives there too, only for a modal screen that named it. The reader never touches the status bar and never will.
- **Screen anatomy and three new props** — see below.
- New helpers in `media-chrome.ts` and `layer-placement.ts` are internal; the tests mirror them against the contract tables.

### Added (schema 9.10)

- **A layer with its own place in a stack** (`layer` on a direct child of `Stack`). The overlay does not size the stack: its cell lies over the stack with `contain: size` and `pointer-events: none`, the layer itself catches taps where it is drawn. Its own alignment words (no key — the word of the stack), an offset along the axes of the stack (`x.toward` `start` / `end` logical, `y.toward` `top` / `bottom`, `by` a spacing token or a whole number 0…128), a rotation about the centre in whole degrees −180…180 (mirrored in right-to-left). The stack itself still clips nothing; the layer is not wider than the stack. Not read outside a `Stack`, together with `fill`, when nothing sizes the stack (counted by the document, not by visibility), or when the value is not an object; an unreadable part (an offset axis, an angle) drops by itself.
- **`pull`** on a child of a flow (`Screen`, `Column`, `Container`, a `Row` without `wrap` and `scrollable`): a negative margin on the outer element of the node's place at the start of the main axis, added to its own margin there; the gap of the parent stays (overlap = `pull − gap`), the later node lies over the earlier one. Not read together with an effective `weight`, outside such a parent, or for a value that is not a token or a whole number 0…128. A pulled first child of the body raises the body area by `pull − gap`, and the body is painted over the app bar.

### Added (schema 9.11)

- **Dots that do not fit are not drawn**. A row of `stops × dotSize + (stops − 1) × dotGap` wider than the carousel area gets no dots and takes no room, like one stop or more than ten; exactly as wide as the area fits. `carouselDotCount` takes the room as a third argument.
- **A carousel** (`props.carousel` on a scrolling `Row` and on a data `Repeater` laid out in a row, without `columns`). The row that scrolls is the node itself (its padding lies INSIDE the scroll); the cards do not shrink; scrolling snaps to the start of a card (`scroll-snap-type: x mandatory`, `scroll-snap-align: start`, `scroll-padding-inline-start` = the start padding); the end of the scroll is always a stop. `perView` (whole 1…6) sets the card width from the visible area — `(viewport − paddingStart − perView × gap − peek) ÷ perView`, not rounded, the own `width` / `minWidth` / `maxWidth` of a card are not read, the card `margin` lies on top; a card that would be narrower than 1 px leaves `perView` unread. `peek` is a spacing reference (default `lg`); `indicator: 'none'` switches the dots off.
- **Dots** — one per STOP (not per card); one stop or more than ten — none, and no room for them. Inactive dot — the colour of the active one at 0.3 opacity. They are decoration (`aria-hidden`); the position is told by the list: `role="list"` on the scrolling element, `role="listitem"` on every drawn card, `tabindex="0"` so that the row scrolls with the arrow keys.
- **The reader owns the state**: the open card follows the scroll position (RTL: the modulus of the negative `scrollLeft`), is kept while the screen is in the stack (coming back with "back" restores it) and starts from the first card for a screen shown again. The host is not told. No animated programmatic scrolling exists, so "reduce motion" holds by construction; a gesture along the row does not leave the carousel (`overscroll-behavior-x: contain`).
- **A data list in a row with `carousel` now scrolls** — the only place a field switches scrolling on; without the field a `Repeater` in a row is as before.
- **Stepped progress** (`ProgressBar.segments`, whole 2…12, and `currentColor`). `floor(round(ratio × N, 6))` steps are filled, a step is filled whole or not at all, the current one is the first unfilled; the gap between steps is `xs`, there is NO track under the gaps; a filled step is `gradient` or `color`, an unfilled one the track colour, the current one `currentColor` when it resolves. A gradient runs along the filled steps (the gaps are cut out). The screen reader hears ONE scale. A value that is not a whole 2…12, or steps narrower than 1 px (measured in the browser), leave the continuous bar with the same ratio.

### Fixed before the release

- **A stepped bar no longer redraws without end**. The kind is decided by the width the PLACE gives; the smallest own width, `(N − 1) × gap`, is the same in both kinds (the continuous replacement keeps it as `min-inline-size`), so measuring no longer changes what is measured. A zero width means "unknown" and keeps the previous kind.
- **The carousel shell is one box**: a column on the width the parent gives, with dots or without — the number of stops no longer depends on whether the dots are drawn (the dots used to blink in a loop next to a sibling).
- **The state of a carousel is its own in every template instance**: the key is the stack frame, the node AND the chain of list-instance indexes (`carouselStateKey`). Three rows of a list keep three cards after "back".
- **A ring with a label keeps its box**: the label in the centre is not an arc and does not enlarge the ring. It carries `data-hl-ring-label`.
- **A modal layer is over the whole page, the app bar included**: every layer of the stack is `isolation: isolate`.
- **With `scroll="page"` the area of a modal layer is the visible part of the block**: a sticky area, never `position: fixed`; its height is `min(window, block)`, and at the two edges (the block starts below the top of the window, or ends above its bottom) the measured intersection of the block with the window (`--hl-visible-h`). A sheet and a window are inside the window.
- **The first screen is always a page, and the event says so**: `shownLookOf` is the one place that answers for drawing and for `onScreenChange`.
- **Not more than two actions in the app bar are drawn**: the first two VISIBLE ones.
- **`pull` on an `AppBar` is not read**.
- **The backdrop of a stuck app bar is the background of the screen root at the size of the root**: at rest the bar is pixel for pixel what the root paints under it (no seam), stuck it shows the top slice of the background. The size is written by an observer as CSS variables; without it (server, first frame) the backdrop is empty and the bar is transparent over the root.
- **Focus does not hide under the stuck app bar**: `scroll-margin-block-start` on the focusable elements of the body = the height of the zone + `stickyOffset`.

### Added (props of the host, schema 9.9)

- **`scroll?: 'page' | 'screen'`** — who scrolls (default `'page'`: the block grows, your page scrolls; `'screen'`: you gave the block a height and the zones work literally).
- **`chrome?: 'sticky' | 'static'`** — only with `scroll="page"`: the app bar sticks to the top (default) or scrolls away with the page.
- **`stickyOffset?: number | string`** — the `top` the app bar sticks at below a fixed header of yours; a number is pixels, a string a length or `var(--your-variable)`, anything else is ignored.

### Changed (the interpretation of an already built document)

- **The app bar stands; only the body scrolls** (`appBarFixed`, `appBarScroll`). The first child of the screen root, when it is an `AppBar` (and visible), is its own zone; everything else is the body. The padding of the root is shared between them: the app bar gets the top and the sides, the body the sides, the bottom and — instead of the top — the screen's `gap` (a body without visible children has no gap). In the default `scroll="page"` mode the app bar is `position: sticky` and paints the background of the screen root under itself (a root without a background gives a transparent zone). The first frame of every document is unchanged — only what happens on scrolling is different.
- **No counterweight opposite the back arrow** (`appBarTitleRoom`). A short title stays centred in the whole bar; only a title longer than "bar minus two zones" becomes wider than before and is ellipsized later.
- **A modal layer has no built-in look** (`modalLayerLook`). The `surface` background under the layer is gone: a screen whose root names no background is now transparent (the builder writes the root background into the document, so only hand-made documents are affected). The body of a layer taller than the available height scrolls, and the app bar of the layer stands.
- **`onScreenChange`** may carry two more keys (`modalPlacement`, `statusBarIcons`) — only when the screen named them.

## [0.9.0] - 2026-10-10

**Reads:** layout documents of schema **9.8.x** and themes of theme contract
**4.0.x**, with icon set 1.0.0. A 9.0 – 9.7 document is read unchanged. The
renderer still opens nothing by itself.

### Added

- **Action catalog (schema 9.8).** `openUrl`, `deeplink` and `close` reach
  `onAction` with a verdict on their parameters: `action.standard`
  (`{ type: 'openUrl', url }`, `{ type: 'deeplink', url, scheme }`,
  `{ type: 'close' }`) when they passed the check of the contract, or
  `action.invalid` (`{ param, problem }`) when one did not — never both, and your
  own actions have neither. The check is the contract's regular expressions
  (`paramFormProblem`), not `new URL`. `params` and the handed action are frozen.
- **Parameters from data (`paramBindings`).** A parameter is read from the data
  of the node at the moment of the press (record, then `data`); only a non-empty
  string up to 2048 characters counts, otherwise the literal stays. An address
  that does not pass the check is never replaced by the literal.
- **`runStandardAction(action, handlers)`** and **`openInNewTab(url)`** — an
  optional helper that performs `action.standard` with the handlers YOU pass; an
  app link only when its scheme is in `deeplinkSchemes`. Also exported:
  `paramFormProblem`, `ACTION_CATALOG` and the types `StandardAction`,
  `InvalidActionParam`, `TrackEvent`, `ScreenShown`.
- **`onTrack(event, source)`** — the analytics event of a press (`action.track`):
  once per press, before the action, before `onNavigate` (also when the host then
  cancels), for `none` too. The handed action does not carry it.
- **The screen-shown event in `onScreenChange`**: the same callback now also gets
  `documentId`, `entry`, `cause` (`entry` / `forward` / `back`), `depth` and
  `record`; `screenId`, `name` and `presentation` are unchanged. One event per
  show — not on re-renders, new data or a new object of the same document, not
  twice in `StrictMode`, not on the server.
- **`carryRecord`**: `navigate` with `carryRecord: true` opens a page from a
  screen button with the record of its own screen.
- Invalid input in the new fields (`paramBindings` not a map, `track` of a wrong
  form, `carryRecord` other than `true`, an action that is not an object) is
  ignored and reported as `ignored-input`; the rest of the action works.

### Clarified before the release (schema 9.8.0)

- A binding of a parameter the catalog marks `bindable: false` (`navigate.screenId`)
  is ignored: the literal acts.
- A held Enter / Space is one press: `keydown` with `repeat` neither acts nor
  sends the analytics event — on a list row and on a real `<button>` (its
  `keydown` is cancelled, so the browser sends no second `click`). A double click
  is two presses.
- The `https` form is narrower: a host of two labels or more whose zone is
  letters (or `xn--…`), a port 1…65535. No IPv4 in any notation, no single-word names.
- A `params` entry is skipped unless its key has the schema form (not empty, no
  whitespace, not `__proto__` / `constructor` / `prototype`, up to 32) and its value
  is a string up to 2048 characters; such names in `track` void the whole event.
- `runStandardAction` reads the action once, trusts only strings, performs exactly
  what it checked; `deeplinkSchemes` is an array or a `Set` of strings, anything
  else means "no schemes".
- A new version of the same document that lacks a screen of the stack restarts the
  flow: the entry screen of the new version, `cause: 'entry'`, `depth: 1`.
- A paragraph of rich text always carries the font of its strut, the base style
  included: the plain text around the parts no longer falls back to the default font.

### Changed

- `close` is handed to the host at every depth and never touches the stack.
- `params` of a handed action are omitted when there are none (`{ type: 'submit' }`
  instead of `{ type: 'submit', params: {} }`).
- A report of an ignored part of an action is delivered at the moment of the
  press, not on the next render.

## [0.8.0] - 2026-10-10

**Reads:** layout documents of schema **9.7.x** and themes of theme contract
**4.0.x**, with icon set 1.0.0. A 9.0 – 9.6 document is read unchanged. The
previous source declared 9.6 and 9.7 and drew none of it.

### Added

- **Rich text (9.6.0).** `Text.spans` styles parts of a template string by the
  name of the place (`color`, `typography`; a named field replaces the field of
  the text style as a whole). The string is split by the same parser that
  substitutes it; empty pieces are dropped, neighbours of the same place are
  merged. One line pitch for the whole paragraph: the paragraph carries the
  font of the tallest part (the strut) and every piece has `line-height: 0`.
  One element for a screen reader. The template value `kind: 'text'` (a word,
  translated under `values.<name>.text`) works in every template. A style for
  a name the template does not declare, an unreadable style or field is
  ignored as the contract says.
- **Progress bar and ring (9.7.0).** `thickness`, `trackColor` and `gradient`
  on both. The track lies under the whole scale, the fill over it; the
  gradient lies along the filled part (a conic gradient on the arc); a limit
  that is not positive is an empty scale. The diameter of a ring comes from the
  box of the node (`style.width` / `height` and their limits, minus padding and
  border), the ring is centered in the box, the arc lies inside the circle and
  starts at the top, clockwise in any writing direction.
- The shared tables `rich-text-cases.json` and `progress-cases.json` run
  through the package without skipped rows.

### Changed

- The ring track is a full ring under the fill, not the second half of one
  conic transition: a translucent fill now shows the track under it.
- The ring is no longer drawn at the `size` word when `style.width` /
  `style.height` names a size.

## [0.7.0] - 2026-10-09

**Reads:** layout documents of schema **9.5.x** and themes of theme contract
**4.0.x**, with icon set 1.0.0. A 9.0 – 9.4 document is read unchanged.

Schema 9.5.0 adds an icon next to the label of a button and of a badge, three
button sizes and a round icon-only button, and states one rule for an icon
that stands beside a text. The package now draws all of it; the previous
source declared 9.5 and drew none of it.

### Added

- **`IconButton`** — a round button without visible text. A real `<button>`:
  it takes focus, `Enter` and `Space` run its action, the focus ring is the
  one of every button. Its accessible name is `props.label` after translation
  and data binding (`aria-label`); a button whose label is empty is still
  drawn and works, named by its icon in words (`chevron-left` → "chevron
  left"). It reads the same theme roles as a button (`variant`), its action
  goes the same way as a button's (including the record of a list row), and
  its geometry is contract data: a square content box of one text line, the
  drawing of one font size, the block padding of the button size on all four
  sides, a pill radius — 28 / 40 / 48 px under the built-in theme, as high as
  a button of the same size. `style.padding`, `style.typography` and
  `style.radius` override each its own part.
- **Button sizes** — `Button.size`: `sm`, `md`, `lg`. Padding and the text
  style of each size come from the contract (`x-style.layout.buttonSizes`) as
  theme tokens; `md` is the button as it was. No field, or a word the reader
  does not know, is `md`.
- **An icon in a button and in a badge** — `icon` and `iconPosition`
  (`start` / `end`, in reading order). The icon is as wide as the font size of
  the label and as high as its line, so it never changes the height of the
  widget; it takes the color of the label and is hidden from assistive
  technology. In a full-width button the icon and the label are centered
  together. A badge with an icon stays text: no role, no focus, no action.
- **Right-to-left.** The order of icon and text is logical: the markup keeps
  reading order and the direction of the screen swaps the sides. Mirroring of
  the drawing is a separate rule (`x-mirroredIcons`), applied once: in Arabic
  a "next" arrow both moves to the left and turns around, a gift only moves.
- **The shared table of cases** of the contract
  (`contract/fixtures/icon-text/icon-text-cases.json`, 39 rows) is run against
  the package, through its functions and through `<HotlayoutScreen>`, with no
  row skipped.

### Changed

- **Dates are stricter and Gregorian** (9.5.0 clarifications). A date is a real
  calendar moment: month 1–12, a day that exists in that month of that year
  (leap years by the Gregorian rule), hour ≤ 23, minute and second ≤ 59, an
  offset within 23:59. The package checks this itself before `Date.parse`, so
  `2026-02-30T00:00:00Z` is shown as it is in every browser (V8 used to read
  it as 2 March) — for `date`, `dateTime`, `time` and `daysUntil`. Dates are
  written in the Gregorian calendar in every language (`th` wrote 2569, `fa`
  1405); digits still follow the language. A locale the platform has no date
  data for (`dv`, `la`, `ba`, `sm`) leaves the value as it is instead of
  writing a date in the language of the machine.
- **Image addresses from your data follow the host first.** The 2048-character
  limit is a limit of the *document* field. For an address that comes from
  `data`: `resolveImageUrl` decides first; without it the default rule
  applies (absolute `https:`, up to 2048); with it your answer is final up to
  a ceiling of 512 KB, above which a placeholder is drawn and `onReport` gets
  `ignored-input`. A `data:image/webp` sample of a few KB now draws when you
  allow it. An address literally written in the document keeps the 2048 limit.
  `javascript:` and `vbscript:` are never an image.
- **A numeric fallback of any length** agrees with its plural form
  (`"1." + 45 zeros` is 1); the 40-character limit is gone. Checking stays
  linear.
- **The accessible name of an icon button** is taken from the icon when the
  label has nothing visible or audible: whitespace *and* invisible format
  characters (U+200B, U+FEFF, U+00AD…) count as empty, not only what `trim()`
  removes.
- Mirrors of the new contract blocks (`x-template.dateCalendar`,
  `dateCalendarCheck`, `rounding`, `x-accessibleName`,
  `x-style.layout.buttonLabelAlign`) are checked against the artifact by the
  package tests. The button label was already centered.
- **The trailing slot of a list row with an icon looks different.** The text
  and the icon are now 4 px (`xs`) apart and the icon is centered on the text
  line. Before, the icon touched the text and sat about 2 px too high (a 16 px
  box on the baseline of a 20 px line). The size of the icon (12 px) and the
  colors are unchanged. The document did not change — the contract named what
  it used to leave to each reader (`x-style.layout.iconBesideText`).
- **Policy.** An icon field that cannot be drawn — a name outside the embedded
  set, a value that is not a string — keeps an empty box of the same size and
  the gap (`unknownIconBesideText`); an empty text beside an icon keeps the
  icon and the gap (`emptyTextBesideIcon`). `size`, `iconPosition` and
  `variant` values outside their lists, including names such as `constructor`,
  fall back to the contract's defaults or to the neutral look; nothing throws.
- **Package size.** The compiled JavaScript grows by about 4 KB (1 KB gzipped).

## [0.6.0] - 2026-10-09

**Reads:** layout documents of schema **9.4.x** and themes of theme contract
**4.0.x**, with icon set 1.0.0. A 9.0 – 9.3 document is read unchanged.

Schema 9.4.0 lets one string of a document hold several values: "3 / 5 steps",
"4 days left", "1,850 points", "120 JOD". The package now draws all of it; the
previous build declared 9.4 and showed such strings empty.

### Added

- **Text templates.** A string of kind `template` — a translatable sentence
  with named places (`{done} / {total} steps`) and a map of values — is drawn
  wherever a string is text for a person: `Text.content`, button and badge
  labels, titles and subtitles of `AppBar`, `ListTile`, `Tab`, `Accordion`, the
  text of a trailing slot. Substitution is one pass over the string; a place the
  document does not declare stays literal, braces included; a value without
  data shows its own fallback and the rest of the sentence stays. The sentence
  is translated as a whole under `<screen>/<node>/<field>.template`, so a
  translation can reorder the places. Values read the same data as a single
  binding, including the record of a list row.
- **Number formats** for bindings: `number` (group and decimal separators of
  the shown language, grouping always on, up to three fraction digits),
  `currency` with the binding's `currency` code (the amount, a no-break space,
  the ISO 4217 code — one order in every language; a whole amount has no
  fraction, otherwise the digits of the currency) and `daysUntil` (whole days
  until a moment, rounded up, never below zero, written as a number).
- **Plural forms.** A template value of kind `plural` shows the form whose CLDR
  category matches the number of another value (`Intl.PluralRules`, cardinal).
  `zero`, `one` and `two` are categories of the language, not exact numbers. The
  language is the one the shown forms are written in: translated forms use the
  rules of the translation, untranslated ones the rules of the document's own
  language — never the device's, and the two are never mixed.
- **`now` prop** — the renderer's clock for `daysUntil`: epoch milliseconds or a
  `Date`. Without it the clock of whoever renders is read on every render. Set
  it when a screen is rendered on a server and hydrated in a browser (both must
  count from the same moment), and in tests and previews. The screen does not
  tick by itself.
- **The shared table of cases** of the contract
  (`contract/fixtures/template/template-cases.json`, 135 rows) is run against
  the package, through its functions and through `<HotlayoutScreen>`, with no
  row skipped.
- **The clarifications of 9.4.0** are part of this release:
  - a template value the renderer does not understand — an unknown kind, not an
    object, a binding without `path` or `fallback`, a plural without `of` or
    `forms.other` — is an empty place without braces
    (`unknownTemplateValueKind`); a plural that agrees with such a value takes
    `other`;
  - an empty string in the data shows the fallback, under any format
    (`emptyBoundString`); the order of data layers is unchanged — an empty
    field of a list row still hides the host value at the same path;
  - a date is only an ISO 8601 string with a time and a zone
    (`dateValueForm`, `x-template.dateTimePattern`), for `date`, `dateTime`,
    `time` and `daysUntil` alike; `"1850"`, `2026-10-14` and a timestamp number
    are shown as they are;
  - when the fallback of a value is shown and looks like a number, a plural
    agrees with it (`pluralNumberWithoutData`);
  - a number above 2^53 − 1 in absolute value is not formatted and picks no
    plural form (`numberBeyondSafeInteger`);
  - a formatting locale the platform has no number data for leaves `number`
    and `currency` values as they are and writes `daysUntil` in plain digits
    (`missingNumberLocaleData`).

### Changed

- **Bound dates are stricter.** Before this release `date`, `dateTime` and
  `time` formatted anything `Date` could parse — `2026-10-14`, even `"1850"`
  (the year 1850). Now only ISO 8601 with a time and a zone is a date; other
  strings are shown as they are. Check what your backend sends.
- **A string of an unknown kind is still empty text** (`unknownStringKind`) —
  but `template` is no longer unknown. A template value of an unknown kind, or
  one that is not an object or does not have the shape of its kind, draws an
  empty place and is reported as `ignored-input`; the rest of the sentence
  stays.
- **Untrusted input.** A template, its value names, plural forms and the
  currency code come from the network like the rest of the document. Maps are
  read by own keys only (`{constructor}` is not a value), substitution is
  linear in the length of the string (a megabyte of text or ten thousand places
  does not stall the page; a value's text is computed once per name), a plural
  never evaluates another plural, a currency code that is not three capital
  Latin letters leaves the number as it is, and the result is always a text
  node.
- `formatBound` (internal) accepts any value and the number formats; the
  date formats behave as before.
- **Package size.** The compiled JavaScript grows by about 9 KB (3 KB gzipped).

## [0.5.0] - 2026-10-09

**Reads:** layout documents of schema **9.3.x** and themes of theme contract
**4.0.x**, with icon set 1.0.0. A 9.0 – 9.2 document is read unchanged.

Schema 9.3.0 turns icons into contract data: instead of ten drawings private to
each renderer there is one library of 332 names (`contract/icons.json`), drawn
the same way by the builder canvas and by every reader.

### Added

- **The whole icon library.** `Icon.props.name` and the icon slots of
  `ListTile` draw any of the 332 names of the set. The drawings are an embedded,
  generated copy of the contract file (`src/icon-set.ts`, refreshed with
  `npm run icons:sync`), checked against `contract/icons.json` by the package
  tests. Each icon is one mask: the set's grid plus the body of the name, filled
  with the node's foreground color, so `style.color` recolors strokes and fills
  alike. Per-element `fill`, `stroke='none'` and `stroke-width` are honoured
  (`lock` has a solid body and an outlined shackle; `check` is bolder than `x`).
  Masks are built on first use and cached.
- **`READER_ICON_SET_VERSION`** — the version of the embedded drawings
  (`1.0.0`), also in the `hotlayout` block of `package.json`. It is independent
  of the schema version, and the renderer decides nothing by it at run time.
- **`THIRD-PARTY-NOTICES.md`** ships in the package: the drawings come from
  Lucide (ISC, with Feather parts under MIT) plus ten drawn by HotLayout.

### Changed

- **29 icon names mirror in right-to-left text** (was 8 in the previous
  contract): arrows, chevrons, `log-in` / `log-out`, `undo` / `redo`, `reply`,
  `forward`, `send`, `external-link`, `trending-*`, `list`, `list-checks`. The
  set holds one left-to-right drawing; the reader flips it once, around the
  center of the icon box.
- **The ten original icons** (`star`, `trophy`, `gift`, `target`, `clock`,
  `check`, `chevron`, `user`, `info`, `lock`) are drawn from the set like all
  the others. They look the same as before.
- **Package size.** The compiled JavaScript grows by about 60 KB (about 18 KB
  gzipped) — the price of carrying all 332 drawings, since an icon name is
  document data and the reader cannot know in advance which ones it will meet.
  The icon set sits in its own module, `icon-set.js`.

### Unchanged on purpose

- A name outside the set, or a value that is not a string, still leaves an empty
  box of the same size (`unknownIcon`, `unreadableIconValue`): nothing is
  substituted, the layout does not shift, and nothing is reported as a broken
  document.

## [0.4.0] - 2026-10-09

**Reads:** layout documents of schema **9.2.x** and themes of theme contract
**4.0.x**. A 9.0 or 9.1 document is read unchanged, without migration.

Schema 9.2.0 says which record a screen sees when it is opened from a list
row, and what the host learns about that record. Before it the contract was
silent, and this package carried nothing: a details screen opened from a
`Repeater` row showed `data` — the same for every row — and the host could not
tell which row had been pressed (every row of a template has the same `nodeId`
and the same `params`).

### Added

- **`source.record`** on `ActionSource` (in `onAction` and in
  `onNavigate`'s `event.source`): the record the action is about, as a flat
  map of data-contract paths — `{ 'item.id': '42', 'item.name': 'Coffee set' }`.
  It is the record of the list row the node is drawn in, laid over the record
  its screen was opened with; absent when there is none. A "Redeem" button on
  a details screen opened from a row carries that row.
- **A `navigate` pressed in a list row opens the screen with the row's
  record.** The record's paths are read from it first, everything else from
  `data`. "Back" drops the record with the screen.

### Changed

- **A screen opened from a list row no longer reads the record's paths from
  `data`.** If you worked around the missing record by swapping `data` in
  `onNavigate`, the row's own record now wins for the fields it has; remove
  the workaround or keep it only for screens opened without a record. The old
  README example (`params.itemId` on a row) could never tell rows of one
  template apart and is replaced.
- **A modal screen opened by a button outside a list sees the record of the
  screen beneath it**; a page opened the same way has no record.
- **A `null` field of a list record no longer hides the value at the same
  path in `data`** inside the row: `null` and a missing key are the same
  "no value" everywhere (policy `absentInDataLayer: 'read-next-layer'`).

### Security

- `source.record` is a new frozen map holding only the record's own keys that
  have the form of a data path; a key with a `__proto__`, `constructor` or
  `prototype` segment is dropped and reported (`ignored-input`). The values
  are the ones the host passed in `collections`: a document cannot put a
  value of its own into the record, and the record is never written anywhere
  — `onWrite` and `writablePaths` are not involved. The document does choose
  which collection a prefix names, so treat an id read from the record as
  user input.

## [0.3.0] - 2026-10-09

**Reads:** layout documents of schema **9.1.x** and themes of theme contract
**4.0.x** — the same as 0.2.0. No migration; the changes are in how the
renderer treats input that does not have the shape the contract promises.

### Security

The layout document and the theme come from the network, and the README has
always said they are "never trusted". A review of the code found that it
did not keep that promise; this release makes it true.

- **A value from the document or the theme can no longer become arbitrary
  CSS.** With server rendering, a `;` in a "colour" (`red;position:fixed;
  inset:0;z-index:…`) became a new style declaration and stretched document
  content over the host page; without a server, a gradient "colour" could add
  a `url(…)` layer and make every user's browser call a foreign host. Every
  value is now parsed by an allow-list of its form before it reaches a style
  (one layer, `sanitize.ts`): colours are `#rrggbb` / `#rrggbbaa` only,
  numbers are finite and clamped to the schema's range (theme numbers
  included — spacing 0…128, shadow ±64, font size 8…96 …), token, role and
  asset names match the token pattern, font family names are words, `align`
  and other enumerations accept listed values only, `Grid.columns` is 2…4.
  A theme cannot produce `url(…)` at all.
- **Nothing is drawn or clicked outside the root element.** The root now has
  `overflow: clip; contain: layout paint`. Before, a wide button, a shadow, a
  negative theme spacing or the 48 px press area of a 1 px button could cover
  the host's own controls and take their clicks.
- **A malformed document or theme no longer throws during render.** A node
  without `props`, `children` that is not a list, `null` where an object is
  expected, an object where a text is expected, a theme with holes — each used
  to throw, and a render error without a host error boundary unmounts the
  whole host application. Such input is now ignored piece by piece and
  reported. If a screen throws anyway, the renderer catches it itself — in the
  browser and during server rendering (no 500) — and shows a neutral notice.
- **`onWrite` is never called with a path that walks the prototype**
  (`__proto__.x`, `constructor.prototype.x`), and action `params` reach the
  host as own keys with string values only (no nested objects, no
  `constructor`).
- **Image addresses are `https:` only by default.** `http:`, `data:`, `blob:`,
  `javascript:` and relative addresses from the document or from bound data are
  drawn as the placeholder.
- **Data paths, binding formats and internal tables are read as own keys**:
  a condition on `constructor` or a format named `toString` no longer finds
  something on the prototype chain.
- **The stylesheet no longer matches host elements.** The reset was scoped to
  `:is([data-hotlayout], #hotlayout)`; on a page with its own `id="hotlayout"`
  element every descendant of it got `all: unset`. The scope is now
  `[data-hotlayout]:not(#hl-none)` — the same specificity, and it matches the
  package's own root only.

### Added

- `writablePaths` — the data paths the document may write to (a list or a
  predicate). Without it the document may name any path of the dictionary
  form; the README shows a safe `onWrite` handler.
- `resolveImageUrl(url, { usage, allowedByDefault })` — your own decision
  about image addresses: restrict them to your hosts, rewrite them to a proxy,
  allow `http://localhost` in development. Types `ResolveImageUrl`,
  `ImageUrlContext`.
- `renderError({ screenId, message })` — what to show instead of a screen that
  threw. Default: *"This screen is not available right now."*
- Reports: `ignored-input` (what was ignored and why), `render-error`,
  `invalid-theme-values` (the theme entries that were dropped).
- `VersionVerdict` of kind `incompatible` carries `relation`
  (`'document-newer' | 'document-older' | 'not-a-version'`), exported as the
  type `IncompatibleRelation`. The `incompatible-document` report gains
  `relation` and `readerVersion`; for an older layout the `console.warn` text
  says to republish it. The contract is unchanged: the rule is still "the major
  must match", only the wording differs.
- README: a **Security model** section (what is guaranteed for an untrusted
  document and theme, what is not, a recommended CSP), where the published
  document and theme are, and where the keys of `data` come from.

### Fixed

- **A condition on a collection now sees the collection.** `{ path: 'tasks',
  op: 'isEmpty' }` — the empty state of a list — looked only into `data`, so
  the "nothing here yet" text was shown *under a non-empty list*. Collections
  are now part of the scope conditions read; a missing collection is an empty
  one, as the data contract says.
- **A date next to a found translation is always a date.** A device locale the
  engine does not accept (`ja_JP_JP`, `th_TH_TH`, `ar-EG-u`) found the
  translation but made `Intl.DateTimeFormat` throw, and the raw ISO string was
  shown. The formatting locale is now the longest well-formed prefix of the
  requested tag (`ja-JP`), then the language of the shown text.
- **Direction follows the text that is actually shown.** A language listed in
  `localization.locales` without a single string in `strings` no longer counts
  as a language of the document (it gave an English screen laid out right to
  left); a document key written with `_` (`ks_IN`) is asked about in its
  canonical form.
- A `locale` longer than 100 characters is not a language tag (60 KB in the
  prop used to cost a second of CPU on the server).
- No more than 50 records of a collection are drawn (`maxCollectionItems` of
  the data contract).

### Changed

- **Action objects reach `onAction` in the shape of the schema**: `type` and a
  `params` map of strings. A field the schema does not have, and a parameter
  that is not a string, are no longer forwarded.
- **`LocaleResolution.directionLocale` is in canonical spelling**, and
  `formatting` is always a well-formed tag (see above).
- **Focus ring.** Buttons and pressable rows get an additional inner ring in
  their own text colour on `:focus-visible`: the outer ring is clipped where
  the element touches the edge of the root.
- A custom colour is accepted in upper or lower case and is written in lower
  case.
- **The default message for a layout of another major now depends on whose
  major is newer.** A newer layout shows *"Update the app to see this
  screen."* (the user can update); an older one, or a malformed version,
  shows *"This screen is not available right now."* (the user can do nothing —
  the layout has to be republished from the builder). The old text put the
  version and the technical reason on the user's screen.

## [0.2.0] - 2026-10-09

**Reads:** layout documents of schema **9.1.x** and themes of theme contract
**4.0.x** (built against schema 9.1.0 and theme contract 4.0.1). Documents of
schema 9.0.x are read as before, without migration.

### Changed

- **`locale` takes the user's locale as the platform gives it.** The match
  used to be exact, so `locale="ar-EG"` on a document translated into `ar`
  showed the document's own language, left to right. Now the renderer follows
  the contract's rule (schema 9.1.0):
  - `_` equals `-`, case does not matter (`ar_EG`, `AR-eg`);
  - subtags are dropped from the end until a language of the document matches
    (RFC 4647 Lookup): `ar-EG` → `ar`, `zh-Hant-TW` → `zh-Hant` → `zh`;
  - never the other way round: `ar` does not pick `ar-EG`;
  - no match → the document's own language.

  If you mapped the device locale to the document's list yourself (the
  `pickLocale` helper from the 0.1.0 README), remove it and pass the locale
  as it is.
- **Dates** are formatted with the requested locale when a translation was
  found (`ar-EG` → Egyptian formats) and with the document's own language
  otherwise. Before, the date took the matched document key (`ar`).
- **`lang` on the root** is the language of the text that is shown (the
  document's key, e.g. `ar`), not the requested locale.
- A malformed `locale` (`''`, `'ar--EG'`, `'x-private'`) means "no language
  asked": the document's own language.

### Added

- `resolveLocale(requested, available, source)` and the `LocaleResolution`
  type — the function the component uses, for hosts whose own chrome
  (`labels`, page title) has to follow the language the screen is shown in.

### Known limits

- `zh-TW` falls to `zh` (usually Simplified), although Taiwan writes
  Traditional: the rule drops subtags and does not consult script data, which
  differs between platforms.

## [0.1.0] - 2026-10-09

First release. Not published to npm yet (`"private": true`).

**Reads:** layout documents of schema **9.0.x** and themes of theme contract
**4.0.x** (built against schema 9.0.0 and theme contract 4.0.1). By the
contract's compatibility policy any 9.x document and any 4.x theme is drawn —
what a newer minor adds is skipped — and another major is refused.
**React:** 18.2+ and 19.

### Added

- `<HotlayoutScreen>` — renders a layout document with a theme and data:
  all 22 widgets of the contract, the shared node style (`style`, `styleWhen`),
  visibility conditions, bindings with `date` / `dateTime` / `time` formats,
  `Repeater` lists and grids, translations from the document.
- Screen stack kept by the component: `navigate` and `navigate.back` between
  screens of one document, named entry points (`entry`), modal screens as
  bottom sheets. `onNavigate` lets the host cancel a transition and drive
  navigation with its own router; `onScreenChange` reports what is shown.
- `onAction` for everything the renderer does not perform itself, `onWrite`
  for data-bound choice groups, `onReport` for fallbacks and refusals (they go
  to `console.warn` when no handler is given — no fallback is silent).
- The contract's compatibility policy: unknown widgets draw their children,
  unknown tokens and style fields are skipped or replaced by the field
  default, a document of another schema major is refused
  (`renderIncompatible` customises the message).
- `checkDocumentVersion`, `READER_SCHEMA_VERSION`, `READER_THEME_VERSION` — the
  version rule as a plain function.
- Themes: a project theme set (`theme`, `themeId`), the built-in light and
  dark themes (`BUILT_IN_THEME_CONTRACT`), `resolveTheme`. An unreadable theme
  falls back to the built-in one and is reported.
- `loadDocument`, `loadTheme`, `HotlayoutLoadError` — optional loaders for
  published files that send no custom request headers (no CORS preflight) and
  bypass caches through the URL.
- Right-to-left scripts: direction from the shown language (CLDR), logical
  layout throughout, mirrored directional icons; `dir` to override.
- Server rendering: no `window` / `document` access on import or during
  render; the stylesheet and theme variables are part of the server markup.
- Next.js App Router support without a wrapper: the component's module carries
  `"use client"`, while the helper functions stay callable from Server
  Components.
- `timeZone` prop — the IANA zone bound dates are written in, so that server
  and browser produce the same text (no hydration mismatch).
- Accessibility: native buttons, keyboard-operable list rows, a visible focus
  ring, WAI-ARIA Tabs (arrow keys, `Home` / `End`, swapped in RTL), modal
  screens as WAI-ARIA dialogs (focus moves in and returns, `Tab` cycles, `Esc`
  closes, the screen underneath is `inert`), focus moves to the new screen
  after navigation, `labels.back` for the back arrow's accessible name.
- Images: asset tokens resolved through `assets`; a token without a URL and a
  URL that failed to load are drawn as a placeholder.
- Style isolation without Shadow DOM: inline styles, theme values as
  `--product-*` variables on the root, a scoped reset; `injectStyles={false}`
  plus `@hotlayout/react/styles.css` for strict CSP.
- Touch targets of at least 48 × 48 px that do not change the designed size of
  buttons.
- ESM build, one file per module, with type declarations that resolve under
  both `bundler` and `node16` / `nodenext` module resolution.

### Known limitations

- Documents are not validated against the JSON Schema.
- Locale matching is exact: `ar-EG` does not select a document's `ar`
  translation (the contract's rule) — map the user's language yourself.
- `action.params` are not readable by bindings; pass a record to the next
  screen through `onNavigate` and `data`.
- Fonts are not loaded: the page must provide the families the theme names.
- No animations or screen transitions.
- Modal screens are bottom sheets inside the root element, not a browser-level
  `<dialog>`.
- No scroll management on screen changes; local UI state (open tab, expanded
  accordion, unbound choice) is not persisted across screens.
- Choice groups have no arrow-key navigation and no accessible group name.
- A host CSS rule marked `!important` overrides the renderer's styles.
- A `Stack` layer with `fill: true` that has an intrinsic size of its own
  (for example a progress ring) is drawn at that size and may overflow a
  shorter stack.
