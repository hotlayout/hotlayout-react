/**
 * Style isolation: a screen neither breaks the host page nor is broken by it.
 *
 * HOW IT WORKS. Everything the reader decides about appearance is written INLINE on the element,
 * and theme values are CSS variables on the screen root. Inline beats any host selector (except
 * `!important`), and variables prefixed `--product-` do not leave the root. The stylesheet below
 * does the other half of the job: it neutralises whatever the inline style does NOT name, so a
 * host's `button { padding }`, `* { box-sizing }` or `.article p { margin }` does not leak in.
 *
 * WHY NOT SHADOW DOM. It isolates more reliably, but (1) server rendering into a shadow root is a
 * declarative `<template shadowrootmode>`, which React hydrates with mismatches; (2) `@font-face`
 * inside a shadow root does not register a font, so the page has to load the theme's typeface
 * anyway; (3) the host loses familiar tooling: test selectors, `:focus-visible` of its own
 * skeleton, measurements. The cost of the chosen path is stated honestly: `!important` in host
 * styles pierces the reset, and only Shadow DOM protects against that.
 *
 * WHAT THE RESET DOES. `all: unset` removes every property the host or the browser gave the
 * element (inherited ones are inherited from the screen root, the rest are initial);
 * `display: revert` restores the element's native `display` (block for `div`, `none` for
 * `<style>`); `box-sizing: border-box` is a contract rule: a box's size includes border and
 * padding (`x-style.sizeIncludes`).
 *
 * SPECIFICITY. The reset selector is `[data-hotlayout]:not(#hl-none) *`. `:not(#...)` adds the
 * specificity of an ID without narrowing anything, since the package root has no such `id`. So the
 * reset beats any chain of host classes (`.page .content p`) and loses only to inline style, i.e.
 * to the reader itself.
 *
 * An `:is([data-hotlayout], #hotlayout)` form must not be used: it has the same specificity, but
 * `:is()` MATCHES each of its arguments. "No element has that id" is true of the package and false
 * of a host page: `<div id="hotlayout">` is the most natural name for a mount point, and then
 * EVERY descendant of it, including what the host drew next to the screen, would get
 * `all: unset`. The negation matches nothing except the package's own root: the package's
 * stylesheet has no right to touch a foreign element.
 */

import { FREE_GAP_VAR } from './alignment'

/** The screen root's attribute: the boundary inside which the package's stylesheet applies. */
export const ROOT_ATTRIBUTE = 'data-hotlayout'

/** Class of a pressable element: the touch area and the focus ring. */
export const PRESSABLE_CLASS = 'hl-press'

/** Class of an element that takes keyboard focus but does not extend the touch area (a tab header). */
export const FOCUSABLE_CLASS = 'hl-focus'

/** Class of an input field (`TextField`): alignment and placeholder colour, which inline style cannot express. */
export const FIELD_CLASS = 'hl-field'

/** The smallest side of a touch target is 48 logical pixels. */
export const MIN_TOUCH_TARGET = 48

/** Marks the element that holds the notice of a screen whose first render pass failed (`screen/first-pass.tsx`). */
export const FAILED_PASS_ATTRIBUTE = 'data-hl-failed'

const SCOPE = `[${ROOT_ATTRIBUTE}]:not(#hl-none)`

/** The empty spacer pseudo-element and the margin that cancels the host's gap (the variable is written by `justifyLayout`). */
const FREE_SPACER = 'content:"";display:block;flex:none'
const FREE_GAP_BACK = `calc(-1 * var(${FREE_GAP_VAR},0px))`

/**
 * Stylesheet the renderer needs. It is injected next to every screen by default
 * (`injectStyles`); hosts with a strict CSP can ship it themselves — the same
 * text is published as `@hotlayout/react/styles.css`.
 */
export const HOTLAYOUT_CSS = [
  `${SCOPE} *,${SCOPE} *::before,${SCOPE} *::after{all:unset;display:revert;box-sizing:border-box}`,
  /*
   * FREE SPACE ON THE MAIN AXIS (`justifyLayout` in `alignment.ts`): `center` and `end` share the
   * auto margins of empty pseudo-elements instead of using `justify-content`. Without room the
   * margins are zero and the children sit as with `start`; nothing slides past the start. A
   * negative margin cancels the gap between the pseudo-element and the first child.
   */
  ...(['block', 'inline'] as const).flatMap((axis) => [
    `${SCOPE} [data-hl-free="center-${axis}"]::before,${SCOPE} [data-hl-free="end-${axis}"]::before{${FREE_SPACER};margin-${axis}-start:auto;margin-${axis}-end:${FREE_GAP_BACK}}`,
    `${SCOPE} [data-hl-free="center-${axis}"]::after{${FREE_SPACER};margin-${axis}-start:${FREE_GAP_BACK};margin-${axis}-end:auto}`,
  ]),
  /*
   * TOUCH TARGET >= 48 WITHOUT CHANGING THE LAYOUT. The button looks exactly as the contract says
   * (label + padding + border: a button with the `sm` padding is 40 tall). The finger lands on an
   * invisible pseudo-element centred on the button: it is out of flow, so it neither shifts
   * neighbours nor changes the button's size.
   */
  `${SCOPE} .${PRESSABLE_CLASS}{position:relative;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none}`,
  `${SCOPE} .${PRESSABLE_CLASS}::after{content:"";position:absolute;top:50%;left:50%;translate:-50% -50%;inline-size:max(100%,${String(MIN_TOUCH_TARGET)}px);block-size:max(100%,${String(MIN_TOUCH_TARGET)}px)}`,
  /*
   * `all: unset` also removed the browser's focus ring, so its own ring is restored in the theme
   * colour. The ring is outside, and the screen root clips everything beyond its edge: for a
   * button flush against the root's edge the outer ring is cut off on that side. So an inner ring
   * in the label colour goes alongside it and is always visible.
   */
  `${SCOPE} .${PRESSABLE_CLASS}:focus-visible{outline:2px solid var(--product-color-primary,currentColor);outline-offset:2px;box-shadow:inset 0 0 0 2px currentColor}`,
  // The ring INSIDE the box: the tab strip scrolls (`overflow-x: auto`) and would clip an outer ring.
  `${SCOPE} .${FOCUSABLE_CLASS}:focus-visible{outline:2px solid var(--product-color-primary,currentColor);outline-offset:-2px}`,
  /*
   * Input field (since 9.13.0). Alignment follows the start of the SCREEN, not of the content
   * (`box.alignBy`): in Arabic the text sits on the right although digits inside run left to right
   * (`dir` on the field). `match-parent` takes the start of the parent rather than of the field
   * itself; Chrome knows it only with a prefix, so there are two declarations and the one the
   * engine understands applies. The placeholder is `muted` while the field is empty.
   */
  `${SCOPE} .${FIELD_CLASS}{text-align:-webkit-match-parent;text-align:match-parent}`,
  `${SCOPE} .${FIELD_CLASS}::placeholder{color:var(--product-color-muted);opacity:1}`,
  /*
   * A SCREEN WHOSE FIRST PASS FAILED shows its notice alone. What was drawn before the part that
   * threw is already in the server markup and cannot be taken back, so it is hidden: the notice is
   * the last child of the layer and its siblings are not displayed. `!important`, because the look
   * of every node is inline.
   */
  `${SCOPE} :has(> [${FAILED_PASS_ATTRIBUTE}]) > :not([${FAILED_PASS_ATTRIBUTE}]){display:none!important}`,
  /*
   * FOCUS DOES NOT HIDE BEHIND A STUCK APP BAR. When the host page scrolls the block and the app
   * bar zone sits at the top of the viewport, the browser, scrolling to a focused element, would
   * place it under the bar's lower edge. The scroll margin is the zone's height plus
   * `stickyOffset`; the variable is written by the screen root (`useStickyBarMetrics`), and where
   * the bar does not stick it is absent and the margin is zero. The bottom margin
   * (`scroll-margin-block-end`, since 9.12.0) is the same for the bottom zone: its height plus
   * `stickyBottomOffset` (`--hl-sticky-clear-end`).
   */
  `${[`.${PRESSABLE_CLASS}`, `.${FOCUSABLE_CLASS}`, '[tabindex]', 'a', 'button', 'input', 'select', 'textarea'].map((target) => `${SCOPE} [data-hl-zone="body"] ${target}`).join(',')}{scroll-margin-block-start:var(--hl-sticky-clear,0px);scroll-margin-block-end:var(--hl-sticky-clear-end,0px)}`,
].join('\n')
