/**
 * "Drag to confirm" (schema 9.22.0, `Button.confirm: 'swipe'`). A mirror of the contract's
 * reference rule; the shared rows are `contract/fixtures/swipe-confirm/swipe-confirm-cases.json`,
 * and the block below is compared with the artifact block `x-swipeConfirm`.
 *
 * The button is drawn as a TRACK with a round thumb at the inline start. The action (and its
 * analytics event, once, before it) runs only when the thumb is dragged to at least 0.9 of its
 * travel and released; released earlier, the thumb returns and nothing happens. A pointer press with
 * no drag does nothing. From the keyboard and for assistive technology it is an ordinary button named
 * by its label: Enter, Space and an activation from a screen reader act at once; a held key repeating
 * is not a press. A disabled button does not move and does not act.
 *
 * Numbers are logical points from the inline START of the button (the right edge in right-to-left
 * writing); the drag is read along the inline axis.
 *
 * No React in this file: the server graph of the entry reads it too.
 */

export const CONFIRM_WORDS = ['swipe'] as const
export type ConfirmWord = (typeof CONFIRM_WORDS)[number]

/** The word of a button as the reader reads it: the one word of the contract, or nothing (an ordinary press). */
export function confirmOf(props: unknown): ConfirmWord | undefined {
  const value = typeof props === 'object' && props !== null ? (props as { readonly confirm?: unknown }).confirm : undefined
  return CONFIRM_WORDS.find((word) => word === value)
}

/** The part of the travel from which a release acts. */
export const SWIPE_THRESHOLD = 0.9

/** The spacing step between the border of the track and the thumb. */
export const SWIPE_THUMB_INSET = 'xs'

/** The drawing of the thumb when the button names no icon; mirrored in right-to-left writing by the icon rule. */
export const SWIPE_THUMB_GLYPH = 'chevron-right'

/** `x-swipeConfirm` of the artifact, whole; a test compares the two. */
export const SWIPE_CONFIRM_RULES = {
  prop: 'confirm',
  on: ['Button'],
  words: [...CONFIRM_WORDS],
  track: {
    box: 'the-box-of-the-button-surface-and-size-as-usual',
    paddingInline: 'not-read',
  },
  thumb: {
    shape: 'circle',
    inset: SWIPE_THUMB_INSET,
    diameter: 'height-minus-twice-the-border-minus-twice-the-inset',
    fill: 'background-of-the-role',
    fillWithoutRoleBackground: 'primary',
    ownBackground: 'paints-the-track-not-the-thumb',
    glyph: 'icon-of-the-button-or-chevron-right',
    glyphSize: 'font-size-of-the-label-style',
    glyphColor: 'foreground-of-the-role',
    glyphColorWithoutRoleBackground: 'onPrimary',
    mirrored: 'by-the-icon-rule',
    rest: 'at-the-inline-start',
  },
  label: {
    area: 'between-the-two-places-of-the-thumb',
    align: 'center',
    iconPosition: 'not-read-the-icon-is-on-the-thumb',
  },
  naturalWidth: 'label-plus-twice-the-thumb-room',
  thumbRoom: 'border-plus-inset-plus-diameter',
  travel: 'width-minus-twice-the-border-minus-twice-the-inset-minus-the-diameter',
  direction: 'from-the-inline-start-to-the-inline-end',
  progress: 'drag-along-the-inline-axis-divided-by-the-travel-clamped-to-0-1',
  threshold: SWIPE_THRESHOLD,
  release: { atOrPastThreshold: 'act', belowThreshold: 'return-no-action-no-event' },
  afterAction: 'thumb-returns-to-the-start',
  noTravel: 'the-gesture-never-acts-keyboard-still-does',
  capture: 'once-it-moves-more-along-the-inline-axis-than-across',
  cancel: 'return-no-action',
  pressWithoutDrag: 'nothing',
  keyboard: 'enter-and-space-act-at-once',
  assistive: 'activate-acts-at-once',
  semantics: 'button-named-by-the-label',
  autoRepeat: 'not-a-press',
  disabled: 'thumb-does-not-move-look-of-a-disabled-button',
  trackEvent: 'once-before-the-action',
  motion: 'return-is-at-the-readers-discretion-reduced-motion-jumps',
  canvas: 'thumb-at-the-start',
  olderReader: 'ordinary-button-a-tap-acts',
  cases: 'contract/fixtures/swipe-confirm/swipe-confirm-cases.json',
} as const

export interface SwipeTrack {
  /** The height of the whole button (border, padding, the line of the label). */
  readonly height: number
  /** The width of the whole button. */
  readonly width: number
  /** The width of the border on one side; without a border, zero. */
  readonly border: number
  /** The inset step as a number of the theme. */
  readonly inset: number
}

export interface SwipeGeometry {
  readonly diameter: number
  /** The room the thumb takes from the edge of the button: the border, the inset and the circle. */
  readonly thumbRoom: number
  /** The way of the thumb from the start to the end. */
  readonly travel: number
  /** The strip of the label: from `thumbRoom` to `width - thumbRoom`. */
  readonly label: { readonly start: number; readonly width: number }
}

/** The geometry of the track. Numbers are from the logical START of the button. */
export function swipeGeometryOf(track: SwipeTrack): SwipeGeometry {
  const border = Math.max(0, track.border)
  const inset = Math.max(0, track.inset)
  const diameter = Math.max(0, track.height - 2 * border - 2 * inset)
  const thumbRoom = border + inset + diameter
  const travel = Math.max(0, track.width - 2 * border - 2 * inset - diameter)
  return { diameter, thumbRoom, travel, label: { start: thumbRoom, width: Math.max(0, track.width - 2 * thumbRoom) } }
}

/** The natural width: the label and the room of the thumb on both sides (the inline padding of the size is not read). */
export function swipeNaturalWidthOf(labelWidth: number, track: Omit<SwipeTrack, 'width'>): number {
  return Math.max(0, labelWidth) + 2 * swipeGeometryOf({ ...track, width: 0 }).thumbRoom
}

/**
 * The part of the travel the thumb has gone. `dx` is the move of the pointer on the screen
 * (rightward positive); the end of the line is on the left in right-to-left writing. No travel is no
 * progress.
 */
export function swipeProgressOf(dx: number, travel: number, rtl = false): number {
  if (!(travel > 0) || !Number.isFinite(dx)) return 0
  const along = rtl ? -dx : dx
  return Math.min(1, Math.max(0, along / travel))
}

/** What a release does. A disabled button never acts. */
export function swipeReleaseOf(progress: number, disabled = false): 'act' | 'return' {
  return !disabled && progress >= SWIPE_THRESHOLD ? 'act' : 'return'
}

/** Where the thumb stands: the distance of its circle from the logical start of the button. */
export function swipeThumbStartOf(track: SwipeTrack, progress: number): number {
  const geometry = swipeGeometryOf(track)
  return Math.max(0, track.border) + Math.max(0, track.inset) + Math.min(1, Math.max(0, progress)) * geometry.travel
}

/** Whether the drag is taken: the move along the line is greater than the move across it. */
export function swipeCapturedBy(dx: number, dy: number): boolean {
  return Math.abs(dx) > Math.abs(dy)
}

/** The ways of pressing a swipe button the table speaks about. */
export type SwipeWay = 'pointerTap' | 'dragPastThreshold' | 'dragShort' | 'enter' | 'space' | 'enterRepeat'
