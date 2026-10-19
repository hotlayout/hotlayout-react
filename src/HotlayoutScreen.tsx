/**
 * Public component of the package: document + theme + data -> a stack of screens.
 *
 * The order here is the reader's order of work: version, theme, screen choice,
 * data, render. The first three steps run once per document, the last two whenever the data
 * changes.
 */
import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { ActionSource, HotlayoutAction, TrackEvent } from './actions'
import type { HapticWord } from './haptic'
import type { DataScope } from './data'
import type { TextDirection } from './direction'
import { directionOf } from './direction'
import type { ResolveImageUrl } from './images'
import { imagePolicy } from './images'
import { normalizeLocaleTag } from './locale'
import type { ScreenShownCause } from './screen-shown'
import { resolveDocumentLocale } from './localization'
import type { ScreenLabels } from './runtime'
import { isRecord } from './sanitize'
import { isPinnedNow } from './countdown'
import { anatomyOf } from './render/anatomy'
import { ShowContext } from './render/contexts'
import { safeRecordOf } from './render/host-boundary'
import { DEFAULT_LABELS } from './runtime'
import { infoOf, startOf } from './screen/flow'
import { useLiveRecords } from './screen/live-flow'
import { actionHandlerOf } from './screen/navigation'
import { ROOT_CONTAINMENT, ROOT_TEXT_RESET } from './screen/root-style'
import { incompatibleRoot, stackLayer } from './screen/stack-views'
import type { LayerEnv } from './screen/stack-views'
import { useCarouselMemory } from './screen/use-carousel-memory'
import { useScreenFlow } from './screen/use-flow'
import { useReportBox, useStartReports } from './screen/use-reports'
import { useScreenShown } from './screen/use-screen-shown'
import { useInputSession } from './screen/use-session'
import { useWidthClass } from './screen/use-width-class'
import { HOTLAYOUT_CSS, ROOT_ATTRIBUTE } from './styles'
import { readerNow } from './text-template'
import { productVar, themeCssVariables } from './theme'
import type { ThemeContract } from './theme'
import type { ThemeReport } from './theme-resolve'
import { resolveTheme } from './theme-resolve'
import type { UiDocument } from './types'
import type { VersionVerdict } from './version'
import type { WidthClass } from './width-class'
import { checkVersion, type IncompatibleRelation } from './version'

/** Records of a collection, keyed by collection name: `{ rewards: [{ title: '…' }, …] }`. */
export type Collections = Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>

/** A screen the renderer is showing. */
export interface ScreenInfo {
  readonly screenId: string
  /** Human-readable name from the document — for logs and analytics, not for display. */
  readonly name: string
  /** `modal` means the previous screen stays visible underneath. */
  readonly presentation: 'page' | 'modal'
}

/**
 * The screen-shown event (`onScreenChange`, schema 9.8.0): what the user is
 * looking at now. It is the top of the screen stack; the event happens once per
 * SHOW — the first screen (`cause: 'entry'`; also after the host changed `entry`
 * or the document), a screen opened by `navigate` (`'forward'`, a modal sheet
 * too) and the screen under a removed one (`'back'`, closing a sheet too). It is
 * not an event on a re-render, new data, another locale, a new object of the
 * same document, an action handed to the host or a cancelled navigation; there
 * is no "hidden" event; the server renders none.
 */
export interface ScreenShown extends ScreenInfo {
  /** `documentId` of the document. */
  readonly documentId: string
  /** The entry-point name the host asked for — only if the document has it as its own key; otherwise `null`. One for the whole flow. */
  readonly entry: string | null
  /** Why the screen is shown. */
  readonly cause: ScreenShownCause
  /** Length of the stack after the change; the first screen is 1. */
  readonly depth: number
  /** The record the screen was opened with, as a flat map of data-contract paths; `null` when it was opened without one. */
  readonly record: Readonly<Record<string, unknown>> | null
  /**
   * Where a modal screen lies (`ScreenEntry.modalPlacement`, 9.9.0): present
   * ONLY when the screen is modal and the document named it. A sheet is the
   * default, so a modal screen without the field has no key.
   */
  readonly modalPlacement?: 'bottom' | 'center'
  /**
   * A REQUEST for the system status bar icons (`ScreenEntry.statusBarIcons`,
   * 9.9.0): `'light'` — light icons for a dark background, `'dark'` — the
   * reverse. Present ONLY when the screen asked. The reader NEVER touches the
   * status bar (no `<meta name="theme-color">`, nothing outside its root) —
   * whether and how to honour the request is the host's.
   */
  readonly statusBarIcons?: 'light' | 'dark'
}

/** A screen change the renderer is about to make on its own. */
export type NavigationEvent =
  | { readonly kind: 'push'; readonly from: ScreenInfo; readonly to: ScreenInfo; readonly action: HotlayoutAction; readonly source: ActionSource }
  | { readonly kind: 'back'; readonly from: ScreenInfo; readonly to: ScreenInfo; readonly action: HotlayoutAction; readonly source: ActionSource }
  /** `navigate.section` (9.12.0): the stack becomes the one named screen. `to` is a page, even if the document declares the screen modal. */
  | { readonly kind: 'switch'; readonly from: ScreenInfo; readonly to: ScreenInfo; readonly action: HotlayoutAction; readonly source: ActionSource }

/** Something the renderer handled on its own and the host may want to know about. */
export type HotlayoutReport =
  | ThemeReport
  /** The document was NOT rendered: its schema major differs from the reader's, or the version is garbage. */
  | {
      readonly kind: 'incompatible-document'
      readonly documentVersion: string
      /** The schema version this build reads. */
      readonly readerVersion: string
      readonly reason: string
      /** `document-older`: the layout must be republished from the builder; the user can do nothing. */
      readonly relation: IncompatibleRelation
    }
  /** The document comes from a newer minor: it is rendered, unknown widgets and tokens are skipped by policy. */
  | { readonly kind: 'newer-minor-document'; readonly documentVersion: string }
  /** `entry` names an entry point the document does not have; the initial screen is shown. */
  | { readonly kind: 'unknown-entry'; readonly entry: string }
  /** The document has no screen to start from. Nothing is rendered. */
  | { readonly kind: 'no-screen'; readonly reason: string }
  /**
   * A part of the document, of the bound data or of a request to the host was
   * ignored because it does not have the shape the contract promises: a node
   * that is not an object, a custom colour that is not `#rrggbb`, an image
   * address the image policy refused, a write path or an action parameter the
   * document had no right to name. The rest of the screen is rendered.
   */
  | { readonly kind: 'ignored-input'; readonly where: string; readonly reason: string }
  /**
   * A screen threw while rendering. The host application is NOT affected: the
   * screen is replaced by a neutral notice (see `renderError`). This is a bug
   * in the renderer or a document it cannot survive — please report it.
   */
  | { readonly kind: 'render-error'; readonly screenId: string; readonly message: string }

export interface HotlayoutScreenProps {
  /**
   * The layout document, as parsed JSON. The renderer does not validate it
   * against the schema (the builder already did) but never trusts it either:
   * unknown widgets, tokens and actions are handled by the compatibility
   * policy of the contract, and a document of another schema MAJOR is refused.
   */
  readonly document: UiDocument
  /**
   * The theme contract — `{ themeContractVersion, defaultThemeId, themes }`, the
   * `theme/published.json` of a project. Omit it to draw with the built-in
   * starter theme. An unreadable theme never blanks the screen: the built-in
   * theme is used and `onReport` is told.
   */
  readonly theme?: ThemeContract | undefined
  /** Which theme of the set to use (e.g. `dark`). Unknown id → the set's default theme. */
  readonly themeId?: string | undefined
  /**
   * Values the layout binds to, as a FLAT map keyed by data-contract path:
   * `{ 'user.name': 'Ada' }`. A screen opened from a list row reads the paths
   * of that row's record from the record first, and everything else from here.
   */
  readonly data?: DataScope | undefined
  /** Lists for `Repeater` widgets, keyed by collection name. */
  readonly collections?: Collections | undefined
  /**
   * The user's locale (BCP 47) — pass the device or browser locale as it is:
   * `ar-EG`, `pt_BR`, `uk-UA`. The renderer finds the document's translation
   * by dropping subtags from the end (`ar-EG` → `ar`), never the other way
   * round (`ar` does not pick `ar-EG`). Found: the translation, this locale's
   * date formats and — unless `dir` is given — the direction of the
   * translation's script. Not found: the document's own language, formats and
   * direction.
   */
  readonly locale?: string | undefined
  /**
   * IANA time zone the bound dates are written in (`'Europe/Kyiv'`, `'UTC'`).
   * By default — the zone of whoever renders, i.e. the user's device. Set it
   * when the screen is rendered on a server and hydrated in a browser: the two
   * usually live in different zones, and the same moment formatted twice gives
   * two different texts — a hydration mismatch.
   */
  readonly timeZone?: string | undefined
  /**
   * The moment the screen is rendered at — epoch milliseconds or a `Date`. The
   * `daysUntil` format counts whole days from it (“4 days left”). By default —
   * the clock of whoever renders, read on every render; the screen does not
   * tick by itself. Set it when the screen is rendered on a server and
   * hydrated in a browser: pass the same moment to both, otherwise a deadline
   * that crosses a 24-hour boundary between the two renders gives two texts —
   * a hydration mismatch. It is also how tests and previews pin the clock.
   */
  readonly now?: number | Date | undefined
  /** Writing direction. By default it follows the language the document is shown in (CLDR, via `Intl.Locale`). */
  readonly dir?: TextDirection | undefined
  /**
   * Public entry-point name (what a push notification or a banner carries).
   * A name the document does not know opens the initial screen: names outlive
   * documents. Changing `entry` or `document` restarts the screen stack.
   */
  readonly entry?: string | undefined
  /** URLs for asset tokens (`logo`, `banner`, …). A token without a URL is drawn as a placeholder. */
  readonly assets?: Readonly<Record<string, string>> | undefined
  /** Texts that belong to the renderer rather than to the document. */
  readonly labels?: Partial<ScreenLabels> | undefined
  /**
   * Called for every action the renderer does not perform itself: `submit`,
   * `share`, your own action types, a `navigate` to a screen this document
   * does not have, and `navigate.back` on the first screen. The `type` is
   * passed exactly as written in the document; `params` are own keys with
   * string values — anything else in them is dropped and reported.
   * `source.record` says WHICH record the action is about: the list row the
   * node is drawn in, or the record the screen was opened with.
   *
   * The renderer OPENS NOTHING by itself — no `window.open`, no link with an
   * address from the document. For `openUrl`, `deeplink` and `close` the action
   * carries a verdict on its parameters (`standard` or `invalid`); performing
   * it is yours — call `runStandardAction(action, …)` from this handler.
   */
  readonly onAction?: ((action: HotlayoutAction, source: ActionSource) => unknown) | undefined
  /**
   * The analytics event of a press (`action.track`). Called exactly once per
   * press of a node whose action carries `track`, BEFORE anything else: before
   * the renderer navigates (also when your `onNavigate` then cancels), before
   * `onAction`, and for `none` too. The handed action does not carry it.
   * Forward it to your analytics; the renderer sends nothing anywhere itself.
   */
  readonly onTrack?: ((event: TrackEvent, source: ActionSource) => void) | undefined
  /**
   * A request for a tactile response (`action.haptic`): one of `light`, `medium`, `heavy`,
   * `selection`, `success`, `warning`. Called exactly once per press of a node whose action
   * names a word, BEFORE `onTrack` and the action of the same press, and for `none` too. A
   * disabled button, a held key's auto-repeat and an unknown word call nothing. The renderer
   * never vibrates by itself: map the word to the haptics of your platform here (for a web
   * page, `navigator.vibrate` where it exists), or leave the prop out for no response.
   */
  readonly onHaptic?: ((kind: HapticWord, source: ActionSource) => void) | undefined
  /**
   * Called BEFORE the renderer changes screens by itself (`navigate` to a
   * screen of this document, `navigate.back`). Return `false` to cancel — the
   * renderer then does nothing, and navigation is yours.
   */
  readonly onNavigate?: ((event: NavigationEvent) => boolean | undefined) | undefined
  /** The screen-shown event: called once per show of a screen, the first one included (see {@link ScreenShown}). */
  readonly onScreenChange?: ((screen: ScreenShown) => void) | undefined
  /**
   * Called when the user changes a data-bound input: a `ChoiceGroup` whose
   * `value` is a binding (a string; picking the option already shown writes
   * nothing), a `TextField` (the text, on EVERY change — throttling is yours;
   * a NUMBER field, `valueType: 'number'`, writes a JSON number, or the empty
   * string `""` when the typed text is not a number or the field was cleared —
   * never `null`), a `Switch` or a `Checkbox` (a boolean, on every press). The PATH IS NAMED BY THE DOCUMENT: never pass it to a deep setter
   * (`lodash.set(state, path, value)`) — store it as a key of a flat map, and
   * list the paths you expect in `writablePaths`. Paths with a `__proto__`,
   * `constructor` or `prototype` segment never reach this handler.
   *
   * The value is what the USER typed: validate it on your backend before you
   * trust it. The renderer also keeps the written value for the lifetime of the
   * flow, so you may leave `data` untouched; if you do put another value under
   * the same path into `data`, it wins over what the user typed.
   */
  readonly onWrite?: ((path: string, value: string | boolean | number) => void) | undefined
  /**
   * Whether the renderer may ask the platform for autofill suggestions in text
   * fields (`email`, `tel`, `url` hints, taken from each field's keyboard
   * intent). Default `true`. Pass `false` to switch every hint off
   * (`autocomplete="off"`) — do it for a document from an untrusted source: a
   * field the document hides can still be autofilled by the browser. The
   * renderer never asks for credentials, card details, postal addresses or
   * one-time codes, whatever the document says.
   */
  readonly autofill?: boolean | undefined
  /**
   * The data paths the document may write to — a list (`['item.selectedId']`)
   * or a predicate. With it, `onWrite` is called for these paths only and
   * everything else is refused and reported. Without it, the document may name
   * ANY path of the data-dictionary form (dot-separated identifiers).
   */
  readonly writablePaths?: readonly string[] | ((path: string) => boolean) | undefined
  /**
   * Your decision about every image address named by the document or by bound
   * data (`Image.source`, a background image, a list thumbnail). By default the
   * renderer loads absolute `https:` addresses only and draws a placeholder for
   * the rest (`http:`, `data:`, `blob:`, relative). Return the URL to load —
   * the same one, or your image proxy — or `null` to refuse. Use it to restrict
   * images to your own hosts, or to allow `http://localhost` in development.
   * `javascript:` and `vbscript:` are never loaded, whatever this returns.
   */
  readonly resolveImageUrl?: ResolveImageUrl | undefined
  /** Fallbacks and refusals. Without a handler they go to `console.warn`, so that no fallback is silent. */
  readonly onReport?: ((report: HotlayoutReport) => void) | undefined
  /** What to show instead of a document of an incompatible schema major. By default — a short `role="alert"` message: "Update the app to see this screen." for a newer major, "This screen is not available right now." for an older one or a malformed version. */
  readonly renderIncompatible?: ((verdict: Extract<VersionVerdict, { kind: 'incompatible' }>, documentVersion: string) => ReactNode) | undefined
  /**
   * What to show instead of a screen that threw while rendering. By default — a
   * short `role="alert"` message: "This screen is not available right now."
   * The error never reaches your application: it is caught inside the renderer
   * (on the server too) and reported through `onReport` as `render-error`.
   */
  readonly renderError?: ((error: { readonly screenId: string; readonly message: string }) => ReactNode) | undefined
  /**
   * Whether to render the package stylesheet next to the screen (default
   * `true`). Turn it off when your CSP forbids inline `<style>` and import
   * `@hotlayout/react/styles.css` yourself.
   */
  readonly injectStyles?: boolean | undefined
  /**
   * Who scrolls (9.9.0, `x-style.layout.screen`). A screen has three zones: the
   * app bar STANDS, only the body scrolls (vertically), the background of the
   * root does not move.
   *
   * - `'page'` (default) — the block has no height of its own: it grows with
   *   its content and the host's PAGE scrolls. See `chrome`.
   * - `'screen'` — you gave the block a height (`100dvh`, a fixed height, a
   *   flex remainder): the root fills it and the zones work literally — the
   *   app bar stands, the body scrolls inside the block.
   */
  readonly scroll?: 'page' | 'screen' | undefined
  /**
   * Only with `scroll="page"`. `'sticky'` (default) — the app bar zone sticks
   * to the top of the viewport while the screen is in view; it lies OVER the
   * content travelling under it, so its zone paints the background of the
   * screen root (a root without a background gives a transparent zone).
   * `'static'` — the app bar stays the top row of the block and scrolls with
   * the page (your site already has its own fixed header).
   */
  readonly chrome?: 'sticky' | 'static' | undefined
  /**
   * Only with `scroll="page"` and `chrome="sticky"`: the `top` the app bar
   * sticks at, when your site has a fixed header above the block. A number is
   * CSS pixels; a string is a length (`'56px'`, `'3.5rem'`) or a CSS variable
   * of yours (`'var(--site-header-height)'`). Anything else is ignored.
   */
  readonly stickyOffset?: number | string | undefined
  /**
   * The bottom safe-area inset (9.12.0): what the reader adds UNDER the content
   * of the bottom zone (the pinned block and the navigation bar) — and only
   * when the screen has such a zone. The background of the navigation bar
   * reaches the physical bottom. `'env'` (default) — `env(safe-area-inset-bottom)`
   * of the browser; a number — CSS pixels you measured yourself (`0` turns it
   * off, when your host already leaves room for the home indicator). Anything
   * else counts as `0`. With `scroll="page"` the inset is added only while the
   * zone sticks (`chrome="sticky"`).
   */
  readonly safeAreaBottom?: number | 'env' | undefined
  /**
   * The top safe-area inset (9.19.0): what the reader adds at the top of the
   * screen — inside the box of the app bar, above its content, so that a named
   * background of the bar covers the status bar; without an app bar — above the
   * body area. `'env'` (default) — `env(safe-area-inset-top)` of the browser; a
   * number — CSS pixels you measured yourself (`0` turns it off, when your host
   * already wraps the reader in a safe area). Anything else counts as `0`. Added
   * only where the screen has its own height (`scroll="screen"`) or while the app
   * bar sticks to the top of the window (`scroll="page"`, `chrome="sticky"`), and
   * never inside a modal layer. A screen with `bodyTop: 'screenTop'` adds nothing
   * to the content of the body: the first child lies under the status bar.
   */
  readonly safeAreaTop?: number | 'env' | undefined
  /**
   * Only with `scroll="page"` and `chrome="sticky"`: the `bottom` the bottom
   * zone sticks at, when your site has a fixed bar below the block. Same forms
   * as `stickyOffset`.
   */
  readonly stickyBottomOffset?: number | string | undefined
  /**
   * Keep Tab inside a modal layer at all times (default `false`). By default a layer the person can
   * dismiss (Esc, the scrim) cycles Tab inside it, while a layer that waits for an action, or has
   * nothing to focus, lets Tab leave the package so a keyboard user can never be locked out of your
   * page by a document. Set it when the reader fills the viewport and nothing else on the page
   * should be reachable.
   */
  readonly trapFocus?: boolean | undefined
  /**
   * The width class to draw until the root has been measured (9.18.0): `'compact'`
   * (default), `'medium'` or `'expanded'`. The reader measures the width of its own
   * root element and switches to the real class after the first layout; a host that
   * already knows the width of the place (a desktop site) passes the class here, so the
   * server markup and the first browser frame have the final layout and nothing jumps
   * after hydration. Any other value counts as `'compact'`. It is a starting point only:
   * after the measurement the real class wins.
   */
  readonly initialWidthClass?: WidthClass | undefined
  /** Class of the root element — size and place the screen with it. */
  readonly className?: string | undefined
  /** Inline style of the root element. Theme variables are added to it. */
  readonly style?: CSSProperties | undefined
}

/**
 * Renders a HotLayout document: the screen named by `entry` (or the initial
 * one) and every screen the user navigates to from it.
 *
 * The component keeps the screen stack itself. `navigate` and `navigate.back`
 * between screens of the same document work out of the box; everything else is
 * handed to `onAction`. Nothing is fetched and nothing global is touched: no
 * `window` access on import, no styles outside the root element.
 */
export function HotlayoutScreen(props: HotlayoutScreenProps): ReactNode {
  const { theme: themeContract, themeId, data = NO_DATA, collections, locale, timeZone, now, dir, entry, assets, labels } = props
  const { onAction, onTrack, onHaptic, onNavigate, onScreenChange, onWrite, onReport, renderIncompatible, renderError, injectStyles = true, className, style } = props
  const { writablePaths, resolveImageUrl, autofill } = props
  const anatomy = anatomyOf(props)
  // The document comes from the network: `null`, a string or an array in its place means a document with no version and no screens.
  const document: UiDocument = isRecord(props.document) ? props.document : NOT_A_DOCUMENT
  const { issues, noteIssue, refuseWrite, deliver } = useReportBox(onReport)

  const images = useMemo(
    () =>
      imagePolicy(resolveImageUrl, (url, reason) => {
        noteIssue({ where: `image address “${url}”`, reason: `${reason}; a placeholder is drawn` })
      }),
    // The report bucket lives as long as the component; the policy depends only on the host's decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolveImageUrl],
  )

  const verdict = checkVersion(document.schemaVersion)
  const resolved = useMemo(() => resolveTheme(themeContract, themeId), [themeContract, themeId])
  const themeVars = useMemo(() => themeCssVariables(resolved.theme), [resolved.theme])
  const start = useMemo(() => startOf(document, entry), [document, entry])
  // Width class (schema 9.18.0): measured from the package ROOT box; before the first measurement it is the host's word or `compact`.
  const [widthClass, measureRoot] = useWidthClass(props.initialWidthClass)
  const flowKey = `${document.documentId}\u0000${entry ?? ''}`
  const { current: given, setFlow, screens } = useScreenFlow(document, flowKey, start)
  // The record of a page opened from a list row follows the data (9.27.0); the stack and the events stay as they are.
  const current = useLiveRecords({ current: given, setFlow, collections, screens, safe: (record) => (record === undefined ? undefined : safeRecordOf(record, noteIssue, 'record of a screen')) })
  const { session, writeSessionValue } = useInputSession(flowKey, data)

  // Stack frames whose screen survives in the current document version, each with its own record.
  const shownFrames = current.stack.flatMap((frame) => {
    const screen = screens.find((entry) => entry.screenId === frame.screenId)
    return screen === undefined ? [] : [{ screen, record: frame.record, links: frame.links }]
  })
  const frames = shownFrames.map((frame) => frame.screen)
  const top = frames[frames.length - 1]
  const topInfo = top === undefined ? undefined : infoOf(top, frames.length === 1)
  const sectionSuffix = current.sections === 0 ? '' : `#${String(current.sections)}`
  const scopes = shownFrames.map((frame, index) => `${String(index + 1)}-${frame.screen.screenId}${sectionSuffix}`)
  const memoryFor = useCarouselMemory(scopes)
  useStartReports({ resolved, verdict, document, start, entry, deliver })
  useScreenShown({ verdict, topInfo, flowKey, current, frames, shownFrames, document, entry, onScreenChange })

  /*
   * Refusal is LOUD and happens before any render. Drawing "as much as fits" of a document from a
   * foreign major would show the user a screen nobody designed, and nobody would learn about it.
   */
  if (verdict.kind === 'incompatible') return incompatibleRoot({ verdict, version: document.schemaVersion, className, style, renderIncompatible })

  // The localization section from the network may be `null` or not an object; then there is none.
  const localization = isRecord(document.localization) ? document.localization : undefined
  /*
   * LOCALE is one answer per document (`locale.ts`): whose texts, whose date format and whose
   * writing direction. The host passes the device locale (`ar-EG`), the document has `ar`; if
   * nothing matches, the document's source language wins, and so does its direction.
   */
  const shown = resolveDocumentLocale(localization, locale)
  // "Now" is ONE instant for the whole screen stack: a page and the layer above it must not count days from different clocks.
  const moment = readerNow(now)
  const direction = dir ?? directionOf(shown.directionLocale)
  const lang = normalizeLocaleTag(shown.directionLocale)
  const screenLabels: ScreenLabels = { ...DEFAULT_LABELS, ...labels }
  const handleAction = actionHandlerOf({ issues, deliver, onTrack, onHaptic, onAction, onNavigate, screens, frames, topInfo, current, setFlow })

  /*
   * WHAT IS SHOWN. `presentation: 'modal'` promises exactly one thing: the previous screen stays
   * VISIBLE underneath. So the topmost page of the stack and all modal layers above it are drawn;
   * pages below it are not drawn at all, and returning to them rebuilds them from scratch (the
   * key is the position in the stack, not just `screenId`).
   */
  let base = frames.length - 1
  while (base > 0 && frames[base]?.presentation === 'modal') base -= 1
  const visible = shownFrames.slice(Math.max(base, 0))

  /*
   * ROOT. Inheritable text properties are named INLINE here: they are how the host page reaches
   * inside (`all: unset` on descendants inherits them from the root), so the root must state each
   * of them itself.
   */
  const rootStyle: CSSProperties = {
    ...ROOT_TEXT_RESET,
    ...ROOT_CONTAINMENT,
    font: productVar('typography', 'bodyM'),
    letterSpacing: `var(--product-tracking-body-m)`,
    color: productVar('color', 'onSurface'),
    ...themeVars,
    ...style,
  }

  const screenProps: LayerEnv['screenProps'] = {
    theme: resolved.theme,
    data,
    collections,
    localization,
    locale,
    shown,
    timeZone,
    now: moment,
    nowPinned: isPinnedNow(now),
    direction,
    onAction: handleAction,
    onWrite,
    assets,
    labels: screenLabels,
    images,
    writablePaths,
    session,
    onSessionWrite: writeSessionValue,
    autofill,
    onWriteRefused: refuseWrite,
    onIssue: noteIssue,
  }
  const env: LayerEnv = { screenProps, base, widthClass, anatomy, resolved, renderError, flowKey, issues, deliver, memoryFor, sectionSuffix, current, handleAction }

  return (
    <div {...{ [ROOT_ATTRIBUTE]: '' }} ref={measureRoot} className={className} dir={direction} lang={lang} style={rootStyle}>
      {injectStyles ? <style dangerouslySetInnerHTML={{ __html: HOTLAYOUT_CSS }} /> : null}
      <ShowContext.Provider value={current.show}>{visible.map((frame, offset) => stackLayer(env, frame, offset))}</ShowContext.Provider>
    </div>
  )
}

const NO_DATA: DataScope = {}

/** What arrived instead of a document and is not one: no version, hence no render. */
const NOT_A_DOCUMENT = {} as UiDocument
