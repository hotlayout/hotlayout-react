/**
 * Whether this renderer understands this document.
 *
 * The first thing the renderer does, and the only place where it may say "no". The rule is the
 * same for all readers of the contract: the major version must match, a newer minor is read
 * and what it adds is skipped.
 */

/*
 * HOW TO READ A DOCUMENT FROM A BROWSER: one trap.
 *
 * Do not add your own headers to `fetch`. A single one (`Cache-Control`) turns the request into a
 * "non-simple" one, the browser sends a preflight, and the storage must separately allow that
 * header. If it does not, the request never happens, and it looks like a missing network: from
 * `TypeError: Failed to fetch` a dropped connection cannot be told from a prohibition.
 *
 * Bypass the cache with the address (`?_req=...`), not a header.
 */

import { ICON_SET_VERSION } from './icon-set'

/**
 * The schema version this renderer is written for. Bumped together with the contract. What the
 * reader implements, by version:
 *
 * 9.4.0: template text (`kind: 'template'`), the formats `number`, `currency`, `daysUntil` and
 * plurals (`text-template.ts`, `binding-format.ts`).
 *
 * 9.5.0: icon and size of a button, a badge icon, the `IconButton` widget and the "icon beside
 * text" rule. Contract data mirrors are in `layout-rules.ts` (`BUTTON_SIZES`, `ICON_BUTTON`,
 * `ICON_BESIDE_TEXT`); drawing is in `render/buttons.tsx` and `render/icon.tsx`.
 *
 * 9.6.0: composed text, `Text.spans` and the template value kind `kind: 'text'`
 * (`rich-text.ts`, `text-template.ts`, `TextView` in `render/text.tsx`).
 *
 * 9.7.0: bar and ring: `thickness`, `trackColor`, `gradient`, the ring diameter from the node's
 * box, the arc inside the circle (`progress.ts`, `render/progress.tsx`).
 *
 * 9.11.0: carousel (`props.carousel` on a `Row` with `scrollable` and on a `Repeater` laid out as
 * a row: snapping, dots, card width from the visible area; `carousel.ts`, `CarouselRow` in
 * `render/carousel-row.tsx`) and bar steps (`ProgressBar.segments` and `currentColor`;
 * `progress.ts`, `ProgressBarView`).
 *
 * 9.10.0: layering with offset: `node.layer` (own alignment, offset and rotation of a layer in a
 * stack; an overlay does not size the stack) and `node.pull` (pulling in the flow). Data mirrors
 * and the reference implementation are in `layer-placement.ts`; drawing is `StackView`
 * (`render/stack.tsx`) and `NodeView` (`render/node-view.tsx`).
 *
 * 9.9.0: image, app bar, screen anatomy, modal layer, status bar. Data mirrors of the contract
 * and their reference implementation are in `media-chrome.ts`; drawing is `ImageView`,
 * `AppBarView` and `ScreenRootView` (`render/image.tsx`, `render/app-bar.tsx`,
 * `render/screen-root.tsx`), and zones, sheet and window are under `screen/` (`layers.tsx`),
 * driven by the host props `scroll` / `chrome` / `stickyOffset`. The package does not touch the
 * system status bar.
 *
 * 9.8.0: action catalog (`action-catalog.ts`: the `standard` / `invalid` verdict, a parameter
 * from data), the analytics event on press, the "screen shown" event (`screen-shown.ts`,
 * `onScreenChange`), `carryRecord`, the `runStandardAction` helper (`standard-actions.ts`). The
 * reader opens nothing by itself.
 *
 * 9.12.0: bottom zone (`bottom-zone.ts`): the `NavBar` / `NavItem` navigation bar, a block
 * pinned to the bottom (`pin: 'bottom'`), the bottom safe area inset (prop `safeAreaBottom`),
 * the `navigate.section` action and the `switch` show reason. A document without a bottom zone
 * is drawn exactly as in 9.11.
 *
 * 9.13.0: input fields (`input-rules.ts`, `input-session.ts`): text field, switch, checkbox. The
 * field value is a data dictionary path; a change is written at once to the reader session and
 * to the host (`onWrite`, the value is a string or a boolean). A document without fields is
 * drawn exactly as in 9.12.
 *
 * 9.14.0: survey form (`form-rules.ts`): `required` (a mark by the label and `aria-required`),
 * a button with `requiresFilled` and `disabledIf` (`aria-disabled`, opacity 0.5, not pressable),
 * the number field (`TextField.valueType: 'number'`, `input-rules.ts`: its own parsing, writes a
 * number or `""`) and the write of a group choice to the reader session. A document without
 * these fields is drawn exactly as in 9.13.
 *
 * 9.15.0: alignment on both axes in a column, container and screen (`alignment.ts`): `justify`
 * and `align` are put as words from the list on the host's flex (`ColumnView`, `ContainerView`
 * in `render/layout.tsx`, `ScreenRootView`); free space comes from a named height source
 * (`style.height`, `style.minHeight`, a `fill` layer). The cross axis of a column parent was
 * drawn before as well: `column.naturalWidthAlign`.
 *
 * 9.16.0: app bar with a node in the leading zone (`zone: 'leading'`), a title from the start
 * (`AppBar.titleAlign`), own drawing size (`glyphSize`): `media-chrome.ts` (`appBarLeadingOf`,
 * `appBarActionsOf`, `appBarLeadingShown`), `glyph-size.ts`; drawn by `AppBarView`, `IconView`,
 * `IconButtonView`.
 *
 * 9.17.0: text emphasis (`style.fontStyle`, `style.textDecoration`, and `weight` in a text part;
 * `text-emphasis.ts`), a list marker (`Text.marker`; `list-marker.ts`) and an own style for the
 * ring label (`labelTypography`, `labelColor`; `RING_LABEL_STYLE` in `progress.ts`). Emphasis
 * travels as a VALUE in the foreground context, and each run draws its own line.
 *
 * 9.18.0, STEP 1: adaptivity by width (`width-class.ts`): the width class from the measured box
 * of the root (`HotlayoutScreen`, prop `initialWidthClass`), `showOn` in the one place that says
 * "visible" (`isNodeShown`), `styleOn` and `propsOn` by resolving the tree for the class BEFORE
 * drawing (`nodeInWidthClass`), `Screen.contentMaxWidth` as the content column of the zones.
 *
 * 9.18.0, STEP 2: wide places (`wide-chrome.ts`): on `medium` / `expanded` the navigation bar
 * stands at the top, as items in the app bar or as its own top strip (`NavBar.widePlacement:
 * 'bottom'` keeps it at the bottom); a sheet without `modalPlacement` becomes a window in the
 * middle (560); the layer's content reads the class of ITS OWN box.
 *
 * 9.19.0: six topics:
 *  1. pressable container (`render/press-host.tsx`): `action` and `label` on `Column`, `Row`,
 *     `Container`, `Stack`; a type within a type and a tree up to eight levels deep are drawn
 *     like any other;
 *  2. money as money (`money.ts`, `rich-text.ts`): `currencyDisplay`, `currencyPosition`,
 *     `sign`, sum parts and part styles `Text.spans[place].parts`;
 *  3. screen top (`screen-top.ts`): `Screen.props.bodyTop: 'screenTop'` and the top safe area
 *     inset (host prop `safeAreaTop`);
 *  4. write actions `setValue` / `toggleValue` and a choice from own nodes (`write-action.ts`,
 *     `render/choice.tsx`): a write by the same path as input fields, without `onAction`; a node
 *     becomes an option (`radio`, its place in the group) or a toggle (`aria-pressed`);
 *     `isEmpty` / `isNotEmpty` on a path of any type (`conditions.ts`);
 *  5. parts of a list row and of a text field (`part-style.ts`, `list-tile-parts.ts`,
 *     `input-parts.ts`; drawn by `render/list-tile.tsx`, `render/text-field.tsx`);
 *  6. `alt` as a document string (`render/alt-text.ts`), an icon from data (`icon-path.ts`,
 *     `render/icon-name.ts`), date parts (`date-parts.ts`) and an explicit `unset` in the width
 *     layer (`width-unset.ts`, `width-class.ts`).
 *
 * 9.20.0: three fields, all optional and without a default:
 *  1. `node.motion` (`motion.ts`): an endless drift (`float`) or breath (`pulse`) that only
 *     paints — a registered phase variable, one linear animation, the pose computed by `sin()` /
 *     `cos()` in the style sheet; the system "reduce motion" and the server render give the pose
 *     at rest;
 *  2. `backdropBlur` of a modal screen entry (`backdrop-blur.ts`, `screen/layers.tsx`): a blur
 *     layer under the scrim, the same area; not read on a page;
 *  3. glass `style.backdropBlur` (`style-box.ts`): `backdrop-filter` on the box of the node.
 *
 * 9.21.0: PERFORMED. `animateChanges` (a number counts to its new value; `render/use-value-transition.ts`,
 * the rule in `value-transition.ts`), the format `countdownPart` with `unit` and `pad` and the clock that
 * ticks it (`countdown.ts`, `render/countdown-clock.tsx`), `cap: 'round'` (`progress-cap.ts`) and the app bar
 * after scrolling, `styleScrolled` and `titleShown` (`app-bar-scrolled.ts`, `render/bar-scrolled.tsx`).
 */
/*
 * 9.22.0: PERFORMED. The floating bar, `NavBar.float` (`nav-float.ts`, the zone and the tail of the
 * body in `render/screen-root.tsx`), the dot on an item, `NavItem.badgeWhen` (`nav-badge.ts`,
 * `render/nav-bar.tsx`), drag to confirm, `Button.confirm: 'swipe'` (`swipe-confirm.ts`,
 * `render/swipe-button.tsx`) and the dashed border, `style.border.style: 'dashed'` (`border-dash.ts`,
 * `render/dashed-border.tsx`).
 *
 * 9.23.0: PERFORMED. `Repeater.where` and the emptiness of a filtered list, a comparison against the
 * value of another path, `valuePath` (`conditions.ts`, `list-filter.ts`), `style.textGradient`
 * (`text-gradient.ts`) and `notation: 'compact'` (`compact-number.ts`, `money.ts`).
 */
/*
 * 9.24.0: PERFORMED. `animateIn` (`value-appear.ts`, `render/use-value-transition.ts`), the busy state after
 * drag to confirm and the promise of the host (`swipe-busy.ts`, `render/swipe-button.tsx`), the motion of
 * the dot on an item (`nav-badge-motion.ts`, `render/use-badge-motion.ts`) and `pin: 'top'` (`top-zone.ts`,
 * `render/top-pinned-zone.tsx`).
 */
/*
 * 9.25.0: the steps of a bar fill smoothly while a value transition runs (`segment-fill.ts`,
 * `render/progress-steps.tsx`), `glow` on a scale (`progress-glow.ts`, `render/glow-layer.tsx`),
 * `style.shadowColor` (`shadow-color.ts`), the press feedback of a pressable node
 * (`press-feedback.ts`, `render/use-press-feedback.ts`) and `haptic` on an action (`haptic.ts`,
 * the `onHaptic` prop).
 */
/*
 * 9.26.0: PERFORMED. `longPress` and `longPressLabel` (`long-press.ts`, `render/use-long-press.tsx`),
 * `Repeater.groupBy` with the header as the second child (`repeater-group.ts`, `render/repeater.tsx`),
 * the drag down of a modal sheet and `dismissible: false` on a screen entry (`sheet-dismiss.ts`,
 * `screen/use-sheet-drag.ts`, `screen/layers.tsx`).
 */
/*
 * 9.27.0: PERFORMED. The record of a frame of the stack is a chain of links that follows the
 * collections the host gives (`live-record.ts`, `screen/live-flow.ts`).
 */
/*
 * 9.28.0: PERFORMED. No new document field; reader rules the contract now states: the default
 * picture address and network limits (`images.ts`), the list budget of a screen
 * (`render/list-budget.ts`), theme numbers out of bounds (`theme-shape.ts`), transparent text out
 * of the name of a card (`silent-paint.ts`), focus of a layer that cannot be dismissed
 * (`screen/layers.tsx`).
 */
export const READER_SCHEMA_VERSION = '9.28.0'

/**
 * The THEME contract version this renderer is written for. The theme is versioned separately
 * from the widget schema: a rebrand adds no widgets, and a new widget does not change the
 * palette. The major rule is the same, the refusal differs; see `theme-resolve.ts`.
 */
export const READER_THEME_VERSION = '4.0.1'

/**
 * Version of the icon DRAWINGS set bundled into this renderer (`contract/icons.json`). Independent
 * of the schema version: a redrawn icon is a patch of the set without a schema change. The
 * document does not carry it, and the renderer decides nothing by it at runtime: it only
 * declares which set is bundled.
 */
export const READER_ICON_SET_VERSION = ICON_SET_VERSION

/** Why a document of a foreign major is refused; see {@link VersionVerdict}. */
export type IncompatibleRelation = 'document-newer' | 'document-older' | 'not-a-version'

export type VersionVerdict =
  /** Can be drawn fully: the renderer knows everything in the document. */
  | { readonly kind: 'compatible' }
  /**
   * A document from the FUTURE of the same major: draw, but be ready to meet the unknown. A minor
   * adds only optional things, so everything required is familiar.
   */
  | { readonly kind: 'newer-minor'; readonly documentVersion: string }
  /**
   * A different major or garbage instead of a version: draw NOTHING.
   *
   * `relation` says WHOSE business it is, and the text for a person depends on it:
   * `document-newer`: the app is out of date, the user can update it;
   * `document-older`: the layout was written for an older contract and is fixed only by
   * republishing from the builder, so there is nothing to tell the user;
   * `not-a-version`: garbage in the version field (not the user's business either).
   * The contract's `checkVersion` reference does not distinguish these (`major_mismatch`), so
   * the distinction lives only here and only in the text: the contract is unchanged.
   */
  | { readonly kind: 'incompatible'; readonly reason: string; readonly relation: IncompatibleRelation }

interface Semver {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

function parse(version: unknown): Semver | null {
  // The version comes from the network: a non-string is the same "not a version" as garbage in a string.
  if (typeof version !== 'string') return null
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (match === null) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function checkVersion(documentVersion: string, readerVersion = READER_SCHEMA_VERSION): VersionVerdict {
  const document = parse(documentVersion)
  const reader = parse(readerVersion)

  if (document === null) return { kind: 'incompatible', reason: `“${documentVersion}” is not a version (expected major.minor.patch)`, relation: 'not-a-version' }
  if (reader === null) throw new Error(`@hotlayout/react: malformed reader version ${readerVersion}`)

  /*
   * The major must match, and this is not over-caution. A major means the MEANING of something
   * existing CHANGED: a field moved, a rule became different. Drawing such a document "as it
   * comes out" would show the user a screen nobody designed, and they would not learn that.
   */
  if (document.major !== reader.major) {
    const newer = document.major > reader.major
    return {
      kind: 'incompatible',
      reason: `major ${String(document.major)} is not readable by a major-${String(reader.major)} reader`,
      relation: newer ? 'document-newer' : 'document-older',
    }
  }

  // A patch changes nothing, so it takes no part in the comparison.
  if (document.minor > reader.minor) return { kind: 'newer-minor', documentVersion }

  return { kind: 'compatible' }
}
