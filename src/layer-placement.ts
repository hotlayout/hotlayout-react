/**
 * Overlay with offset (schema 9.10.0): a layer's place in a stack (`node.layer`) and pulling a
 * node within the flow (`node.pull`).
 *
 * The rules are contract data (`x-style.layout.layer`, `x-style.layout.pull`); the functions are
 * the reference implementation's, verbatim (the layer-placement module together with
 * `readerLayerOf`, `sizesStack`, `effectivePull` and `pullAxisOf`). The package imports nothing
 * from the contract repository, so the rule is written here a second time; the two copies are kept together
 * by the shared case table `contract/fixtures/offset/offset-cases.json` and by a test that
 * compares the data blocks with the artifact.
 *
 * Layout in the browser is done by CSS (`render/stack.tsx` and the node-placement modules); this
 * module does the value reading, the places where a field applies, and the arithmetic that a test
 * compares with the table rows.
 */
import { isRecord } from './sanitize'
import type { UiNode } from './types'

export const LAYER_OFFSET_X_TOWARD = ['start', 'end'] as const
export const LAYER_OFFSET_Y_TOWARD = ['top', 'bottom'] as const
export type LayerOffsetXToward = (typeof LAYER_OFFSET_X_TOWARD)[number]
export type LayerOffsetYToward = (typeof LAYER_OFFSET_Y_TOWARD)[number]
export const MIN_LAYER_ROTATE = -180
export const MAX_LAYER_ROTATE = 180
const ALIGN_WORDS = ['start', 'center', 'end'] as const
export type AlignWord = (typeof ALIGN_WORDS)[number]
/** Largest integer value of `by` and `pull` in logical pixels (`spacingRef`). */
export const MAX_SPACING_PX = 128
const TOKEN_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/

/** A spacing reference: a token name or an integer 0..128 (a number stays a number). */
export type SpacingRef = string | number

/** Mirror of `x-style.layout.layer` (without the service keys `offsetX`, `offsetY`, `widget`, `clippers`, `cases`). */
export const LAYER_RULES = {
  field: 'layer',
  acceptedBy: 'direct-child-of-stack',
  sizing: 'overlay-does-not-size-the-stack',
  stackNeeds: 'at-least-one-layer-that-is-neither-fill-nor-overlay',
  size: 'own-size-not-wider-than-the-stack',
  align: 'own-align-else-stack-align',
  order: 'align-then-offset-in-stack-axes-then-rotate',
  offsetAxes: 'stack-axes-x-logical-y-physical',
  offsetUnit: 'spacing-token-or-logical-px',
  rotateUnit: 'whole-degrees-clockwise',
  rotateOrigin: 'center',
  rotateRange: { min: MIN_LAYER_ROTATE, max: MAX_LAYER_ROTATE },
  rtl: 'offset-x-and-rotate-mirrored',
  layoutBox: 'unshifted-unrotated',
  paintOrder: 'document-order-first-is-lowest',
  clip: 'by-radius-named-size-scroll-and-screen-only',
  stackClips: 'only-with-own-radius-or-named-size',
  taps: 'where-drawn-inside-the-stack-box',
  protrusionTaps: 'not-promised',
  protrusionOverLaterSiblings: 'not-promised',
  withFill: 'fill-wins',
  outsideStack: 'ignore',
  unreadable: { layer: 'ordinary-layer', align: 'stack-align', offsetAxis: 'no-offset-on-that-axis', rotate: 'no-rotation' },
} as const

/** Mirror of `x-style.layout.pull` (without the service key `cases`). */
export const PULL_RULES = {
  field: 'pull',
  acceptedBy: ['Screen', 'Column', 'Container', 'Row without wrap and without scrollable'],
  axis: 'main-axis-of-the-parent',
  toward: 'main-start',
  unit: 'spacing-token-or-logical-px',
  gap: 'kept',
  overlap: 'pull-minus-gap',
  followers: 'move-with-the-child',
  parentSize: 'shorter-by-the-pull-not-below-zero',
  crossAxis: 'unchanged',
  firstChild: 'pulled-too',
  hiddenChild: 'no-pull',
  beyondOwnSize: 'arithmetic',
  paintOrder: 'later-over-earlier',
  taps: 'the-later-child-in-the-overlap',
  withWeight: 'weight-wins',
  outsideFlow: 'ignore',
  onAppBar: 'ignore',
  unreadable: 'no-pull',
} as const

/** Whether a value is a valid spacing reference: a token matching the name pattern, or an integer 0..128. No clamping. */
export function isReadableSpacingRef(value: unknown): value is SpacingRef {
  if (typeof value === 'string') return TOKEN_NAME.test(value)
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SPACING_PX
}

export interface ReaderLayer {
  readonly alignHorizontal: AlignWord | undefined
  readonly alignVertical: AlignWord | undefined
  readonly offsetX: { readonly toward: LayerOffsetXToward; readonly by: SpacingRef } | undefined
  readonly offsetY: { readonly toward: LayerOffsetYToward; readonly by: SpacingRef } | undefined
  readonly rotate: number
}

function readAlign(value: unknown): AlignWord | undefined {
  return (ALIGN_WORDS as readonly unknown[]).includes(value) ? (value as AlignWord) : undefined
}

function readOffsetAxis<T extends string>(value: unknown, words: readonly T[]): { toward: T; by: SpacingRef } | undefined {
  if (!isRecord(value)) return undefined
  const toward = value.toward
  if (!(words as readonly unknown[]).includes(toward)) return undefined
  return isReadableSpacingRef(value.by) ? { toward: toward as T, by: value.by } : undefined
}

/**
 * The value of `node.layer` as the reader sees it. `undefined` means the value is not an object,
 * i.e. the node is an ordinary layer rather than an overlay. An unreadable part is dropped on its
 * own (alignment falls back to the stack's word, an offset axis to no offset, an angle to no
 * rotation); an unknown key is skipped. `3.0` is an integer.
 */
export function readLayerValue(value: unknown): ReaderLayer | undefined {
  if (!isRecord(value)) return undefined
  const offset = isRecord(value.offset) ? value.offset : {}
  const rotate = value.rotate
  const readable = typeof rotate === 'number' && Number.isInteger(rotate) && rotate >= MIN_LAYER_ROTATE && rotate <= MAX_LAYER_ROTATE
  return {
    alignHorizontal: readAlign(value.alignHorizontal),
    alignVertical: readAlign(value.alignVertical),
    offsetX: readOffsetAxis(offset.x, LAYER_OFFSET_X_TOWARD),
    offsetY: readOffsetAxis(offset.y, LAYER_OFFSET_Y_TOWARD),
    rotate: readable ? rotate : 0,
  }
}

/** A node as the placement rules see it (type, props, children, node fields): exactly what the rules ask for. */
type PlaceNode = Pick<UiNode, 'type'> & Partial<Pick<UiNode, 'props' | 'children' | 'fill' | 'weight' | 'layer' | 'pull'>>

/** A full-stack layer beats everything (`withFill`); outside a stack `fill` is not read. */
function effectiveFill(node: PlaceNode, parent: PlaceNode | undefined | null): boolean {
  return node.fill === true && parent?.type === 'Stack'
}

/**
 * An overlay as the reader sees it (`readerLayerOf`): the layer's place, or `undefined` when the
 * node is an ordinary layer. Four conditions together: the parent is a `Stack`; the node is not
 * `fill: true`; the value is an object; and the stack has at least one layer that is neither an
 * overlay nor stretched. That is counted by the DOCUMENT, not by visibility.
 */
export function readerLayerOf(node: PlaceNode, parent: PlaceNode | undefined | null): ReaderLayer | undefined {
  if (parent?.type !== 'Stack') return undefined
  if (effectiveFill(node, parent) || node.layer === undefined) return undefined
  const own = readLayerValue(node.layer)
  if (own === undefined) return undefined
  const layers = parent.children ?? []
  const sized = layers.some((layer) => !effectiveFill(layer, parent) && !(layer.layer !== undefined && readLayerValue(layer.layer) !== undefined))
  return sized ? own : undefined
}

/** Whether a layer takes part in measuring the stack. */
export function sizesStack(node: PlaceNode, parent: PlaceNode | undefined | null): boolean {
  return !effectiveFill(node, parent) && readerLayerOf(node, parent) === undefined
}

/** A weight the reader honours: an integer >= 1 (`weightOf` in `layout-rules.ts` adds an upper bound). */
function hasReaderWeight(node: PlaceNode): boolean {
  return typeof node.weight === 'number' && Number.isInteger(node.weight) && node.weight >= 1
}

/** A weight divides a row only in a `Row` without `wrap` and `scrollable`, and in a `Container` with `direction: 'row'`. */
function acceptsWeighted(parent: PlaceNode | undefined | null): boolean {
  if (parent === undefined || parent === null) return false
  const props = parent.props ?? {}
  if (parent.type === 'Row') return props.wrap !== true && props.scrollable !== true
  return parent.type === 'Container' && props.direction === 'row'
}

/** The flow's main axis along which children follow one another, or `undefined` (`pullAxisOf`). */
export function pullAxisOf(parent: PlaceNode | undefined | null): 'column' | 'row' | undefined {
  if (parent === undefined || parent === null) return undefined
  const props = parent.props ?? {}
  if (parent.type === 'Screen' || parent.type === 'Column') return 'column'
  if (parent.type === 'Container') return props.direction === 'row' ? 'row' : 'column'
  if (parent.type === 'Row') return props.wrap !== true && props.scrollable !== true ? 'row' : undefined
  return undefined
}

/** Pull as the reader sees it (`effectivePull`): `undefined` means it does not apply. */
export function effectivePull(node: PlaceNode, parent: PlaceNode | undefined | null): { readonly by: SpacingRef; readonly axis: 'column' | 'row' } | undefined {
  const axis = pullAxisOf(parent)
  // The app bar is a screen zone, not a flow child: the field is not read on it.
  if (node.type === 'AppBar' || axis === undefined || node.pull === undefined) return undefined
  const by: unknown = node.pull
  if (!isReadableSpacingRef(by)) return undefined
  if (hasReaderWeight(node) && acceptsWeighted(parent)) return undefined
  return { by, axis }
}

/* ───────────────────────── geometry (for tests) ───────────────────────── */

export interface LayerGeometryInput {
  readonly stack: { readonly width: number; readonly height: number }
  readonly layer: { readonly width: number; readonly height: number }
  readonly alignHorizontal: AlignWord
  readonly alignVertical: AlignWord
  readonly offsetX?: { readonly toward: LayerOffsetXToward; readonly by: number }
  readonly offsetY?: { readonly toward: LayerOffsetYToward; readonly by: number }
  readonly rotate?: number
  readonly direction: 'ltr' | 'rtl'
}

export interface LayerGeometry {
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly angle: number
  readonly protrudes: boolean
}

function alongAxis(room: number, size: number, align: AlignWord): number {
  if (align === 'start') return 0
  return align === 'end' ? room - size : (room - size) / 2
}

/** Whether a point (in the stack's physical coordinates) lies on a layer where it is DRAWN. */
export function layerContainsPoint(geometry: LayerGeometry, point: { readonly x: number; readonly y: number }): boolean {
  const { rect, angle } = geometry
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const radians = (-angle * Math.PI) / 180
  const dx = point.x - centerX
  const dy = point.y - centerY
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
  return Math.abs(localX) <= rect.width / 2 && Math.abs(localY) <= rect.height / 2
}

/** An overlay's rectangle and angle: alignment, offset in the stack's axes, mirrored in RTL. */
export function layerGeometry(input: LayerGeometryInput): LayerGeometry {
  const { stack, layer, direction } = input
  const rtl = direction === 'rtl'
  let inlineStart = alongAxis(stack.width, layer.width, input.alignHorizontal)
  if (input.offsetX !== undefined) inlineStart += input.offsetX.toward === 'end' ? input.offsetX.by : -input.offsetX.by
  let y = alongAxis(stack.height, layer.height, input.alignVertical)
  if (input.offsetY !== undefined) y += input.offsetY.toward === 'bottom' ? input.offsetY.by : -input.offsetY.by
  const x = rtl ? stack.width - inlineStart - layer.width : inlineStart
  const rotate = input.rotate ?? 0
  const angle = (rtl ? -rotate : rotate) || 0
  const rect = { x, y, width: layer.width, height: layer.height }
  const radians = (angle * Math.PI) / 180
  const centerX = x + layer.width / 2
  const centerY = y + layer.height / 2
  const EPSILON = 1e-9
  const protrudes = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].some(([sx, sy]) => {
    const dx = ((sx ?? 0) * layer.width) / 2
    const dy = ((sy ?? 0) * layer.height) / 2
    const px = centerX + dx * Math.cos(radians) - dy * Math.sin(radians)
    const py = centerY + dx * Math.sin(radians) + dy * Math.cos(radians)
    return px < -EPSILON || py < -EPSILON || px > stack.width + EPSILON || py > stack.height + EPSILON
  })
  return { rect, angle, protrudes }
}

export interface PullFlowChild {
  readonly size: number
  readonly pull?: number
}

/** Flow arithmetic with pulled children: the starts along the axis and the length of the parent's content. */
export function pullFlow(children: readonly PullFlowChild[], gap: number): { readonly starts: readonly number[]; readonly size: number } {
  const starts: number[] = []
  let cursor = 0
  children.forEach((child, index) => {
    const start = cursor + (index === 0 ? 0 : gap) - (child.pull ?? 0)
    starts.push(start)
    cursor = start + child.size
  })
  return { starts, size: Math.max(0, cursor) }
}
