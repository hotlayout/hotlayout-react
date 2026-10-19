# Hardening review, October 2026

`@hotlayout/react` renders documents, themes and data that arrive from the network inside
someone else's page. This review checks nine limits against that input. Each limit has tests in
`src/hardening-2026-10/`; a test whose name starts with `LIMIT DOES NOT HOLD` states the correct
behaviour and fails today. Shared helpers live in `test-support/hardening-kit.tsx`.

Earlier hardening tests (`src/hardening*.test.tsx`, `src/*adversarial*.test.tsx`) put one hostile
string and one hostile number (123 456 789) into every leaf. This pass widens the inputs (every
extreme number, every key, every gesture sequence, large data) rather than repeating those.

Result: 230 tests pass, 10 fail. Six limits hold completely; four hold only in part.

## Summary

| # | Limit | Status | Failing tests |
|---|---|---|---|
| 2 | Pictures | **does not hold** | 4 |
| 7 | UI containment | **does not hold in part** | 3 |
| 8 | Information leaks | **does not hold in part** | 2 |
| 3 | Accessible name of a card | **does not hold in part** | 1 |
| 1 | Number handling | holds | 0 |
| 4 | Actions | holds | 0 |
| 5 | Writes | holds | 0 |
| 6 | Resource exhaustion | holds | 0 |
| 9 | Server render | holds | 0 |

Ordered by importance below.

## 2. Pictures — does not hold

`pictures.test.tsx`

**FIXED in 0.25.0.** **2a. The default rule loads IP literals, `localhost` and addresses with credentials.**
Without `resolveImageUrl` the reader loads any absolute `https:` address (`isHttpsUrl` in
`sanitize.ts`). That includes `https://192.168.1.1/router.png`,
`https://169.254.169.254/latest/meta-data/`, `https://127.1/`, `https://2130706433/`,
`https://[::1]/`, `https://localhost:8443/` and `https://user:secret@cdn.example/`, from the
document and from data alike. All 15 addresses in the test are loaded. A picture loads without a
click, so a document can make every visitor's browser send GET requests into their own network
(router admin pages, printers, local dev servers). The response is not readable, but the request
happens, and a timing difference reveals whether the host exists. The `openUrl` form
(`x-actions.forms.httpsUrl`, `HTTPS_URL_PATTERN`) already refuses all of these for a link, so
today a picture is looser than a link.
*Fix:* judge the default with the same host form as `httpsUrl` (a host name with a letter top-level
label, no `@`, no IP literal, no `localhost`) and report "not a public host name". A host that needs
such addresses (development, an intranet) still allows them through `resolveImageUrl`.
`allowedByDefault` in `ImageUrlContext` should then be `false` for them.

**FIXED in 0.25.0.** **2b. The picture request carries the host page address.** `<img>` has no `referrerPolicy`, so
the image host receives the page URL as `Referer` (the browser default
`strict-origin-when-cross-origin` sends the origin cross-site; a host page with a looser policy
sends the full path, which on a bank site can include an account or session route).
*Fix:* `referrerPolicy="no-referrer"` on every `<img>` the reader draws; add `loading="lazy"` and
`decoding="async"` too (see 7b for why `lazy` matters on the server). A CSS `background-image`
cannot carry a policy: either draw background images as an `<img>` layer, or document that the
host's own `Referrer-Policy` applies to them.

**FIXED in 0.25.0.** **2c. A script address hides from the one rule the host cannot override.** `NEVER_AN_IMAGE`
(`images.ts`) tests `/^\s*(?:javascript|vbscript)\s*:/i`. The URL parser also strips leading C0
control characters (`\u0000`–`\u001f`) and removes tab, line feed and carriage return anywhere,
so `"\u0001javascript:…"` and `"java\tscript:…"` are `javascript:` to the browser but pass the
check when `resolveImageUrl` returns the address unchanged. Modern browsers do not run
`javascript:` in `<img src>` or CSS `url()`, so the impact is low, but the documented invariant does
not hold.
*Fix:* normalise as the URL parser does (strip C0 controls and spaces at both ends, remove all
tab/LF/CR) before testing, or better, parse the host's answer with `new URL` and keep an
allow-list of schemes (`https:`, `http:`, `data:`, `blob:`).

Noted, not tested: browsers bound the decoding of a huge picture themselves; the reader has no say
in it. `srcset` is never written (checked). No `crossorigin` attribute, so no credentialed CORS
request (checked).

## 7. UI containment — does not hold in part

`containment.test.tsx`

**FIXED in 0.25.0.** **7a. A non-dismissible modal layer is a keyboard trap for the host page.** The layer's `onKeyDown`
(`screen/layers.tsx`) cancels Tab when the layer has nothing to focus, and cycles Tab from the last
stop back to the first. With `dismissible: false` Esc is ignored too, so a keyboard user cannot
reach anything on the host page outside the package until the document lets them (WCAG 2.1.2,
"No Keyboard Trap", applies to the host page as a whole). A document that opens such a layer with
no action inside locks keyboard users out of the bank's page.
*Fix:* keep the cycle where the person has a way out (a dismissible layer: Esc), and for a
non-dismissible layer let Tab leave the package at either end instead of cancelling it. If a host
wants a full trap (the package fills the viewport), make it a host decision, e.g. a `trapFocus` prop,
rather than a document decision. The existing modal cycle tests in `a11y.test.tsx` use dismissible
layers and keep passing.

**FIXED in 0.25.0.** **7b. Server markup puts an element before the package root.** With React 19, `renderToString` of a
screen with an `<img>` emits `<link rel="preload" as="image" href="…">` ahead of
`<div data-hotlayout>`; in a full document render React hoists it into the host's `<head>`. The
address has passed the image policy, so this is not a new address, but it is markup outside the
root and a high-priority request that ignores the screen being shown.
*Fix:* `loading="lazy"` on the `<img>` (React does not preload lazy images); this also defers
pictures below the fold. If eager loading is wanted for the first picture, set `fetchPriority`
explicitly and accept the hoisted link knowingly.

What holds: no element of any fixture screen is fixed-positioned, `z-index` stays within ±10,
nothing is drawn outside the root (no portals), `inert` lands only on the package's own layers, and
Esc inside a dismissible layer does not reach the host's listeners.

## 8. Information leaks — does not hold in part

`info-leaks.test.tsx`

**FIXED in 0.25.0.** **8a. A refused picture address from data goes into the console and into the report.**
`HotlayoutScreen.tsx` reports `image address “<first 120 characters>”` for every refused address.
For an address from the host's DATA that text is the host's value, query string included
(`?token=…`). Without `onReport` it is printed with `console.warn`; with `onReport` it is handed to
the host's report handler, which hosts commonly forward to error telemetry. A signed URL or a
customer identifier in a picture path ends up in logs that were not meant to hold it.
*Fix:* for `origin: 'data'` report the binding path and the reason, not the value (at most the
scheme and host). Document addresses may stay in the report: they are the document's own text.

What holds: a node hidden by `visibleIf` or by `showOn` leaves no data value in the markup, in the
browser or on the server; a refused write reports the path, never the value.

## 3. Accessible name of a pressable card — does not hold in part

`accessible-name.test.tsx`

**FIXED in 0.25.0.** **3a. Fully transparent text is part of the name.** A card is named by its `label`, then by the text
of its content. Text with `style.opacity: 0` is invisible but still read, so a document can show
"Show offer" and have a screen reader announce "Show offer Confirm transfer". The same holds for a
text colour with zero alpha (`#rrggbb00`). Severity is low (the document author controls both
texts anyway), but the visible and the heard name of the same press differ.
*Fix:* mark a node whose resolved opacity is 0, or whose text colour has zero alpha, `aria-hidden`
(it shows nothing, so it should say nothing); the builder can also refuse such text inside a
pressable container.

What holds: children hidden by `visibleIf`, by `showOn` in the current width class, the folded body
of an accordion and inactive tab panels are not part of the name.

## 1. Number handling — holds

`numbers.test.tsx`

Every numeric leaf of every contract fixture (782 leaves), every numeric value of the host data and
collections, and every numeric leaf of the built-in theme were replaced with `1e300`, `-1e300`,
`1e-300`, `-0`, `Infinity` (what `JSON.parse('1e309')` gives), `-Infinity` and `NaN`. On the server
and in the browser: no screen threw, no `style` carried an exponent, `NaN`, `Infinity` or a
seven-digit number, the markup never grew past five times the clean screen, no interval was shorter
than one second and no timeout was unbounded, and a value transition to any of these numbers stopped
scheduling frames within three seconds. The number guard used by the test is itself tested.

## 4. Actions — holds

`gestures.test.tsx`

A touch tap with emulated mouse events gives one action on a button and on a card; a double click is
two presses and `dblclick` adds nothing; Enter and Space give one press each and a held key repeats
nothing; a long press followed by the click the browser still sends gives the long press action
only, also with two fingers down. Every pressable element of every fixture screen, pressed by click
and by Enter: no `window.open`, no navigation, and no `<a href>`, `<form>`, `<iframe>`, `<base>` or
`<meta>` in the markup.

## 5. Writes — holds

`writes.test.tsx`

Every fixture screen left alone for ten minutes of timers (countdowns, motion, transitions) and given
new host data writes nothing; a value the platform puts into fields nobody focused is not written;
paths that only look allowed (whitespace, case, a trailing dot, an empty segment, a full-width dot, a
zero-width character, a NUL) do not pass an exact `writablePaths` list.

## 6. Resource exhaustion — holds

`exhaustion.test.tsx`

Every fixture screen with collections of 5 000 and of 40 000 records: the drawn rows stay bounded
(`MAX_COLLECTION_ITEMS`) and the time grows linearly. A document of 100 000 sibling nodes renders on
the server in linear time. A live record followed across 160 000 records updates in linear time. Every
regular expression the contract artifacts publish (about twenty) was run in V8 against 630 inputs of 20 000
characters built to make a backtracking engine slow; none took more than 150 ms. The one infinite
animation in the package stylesheet stops under `prefers-reduced-motion: reduce`.

## 9. Server render — holds

`ssr.test.tsx`

Every string leaf of every fixture, and a new KEY in every object of every fixture, received a markup
payload (`</div></style></script><script>…</script><style>…</style><img src=x onerror=…><!--`).
`renderToString` never threw, and no tag or comment of the payload reached the HTML string: React
escapes text and attribute values, and the package writes no raw HTML from the document (its only
`dangerouslySetInnerHTML` is its own stylesheet).
