/**
 * A countdown that ticks (schema 9.21.0, format `countdownPart`): which nodes of a screen show a
 * part of the time left, and how often the screen has to be drawn again for them. A mirror of the
 * contract's reference rule (`x-countdown.ticking`); the arithmetic and the written form live in
 * `binding-format.ts`, and the shared table is the `countdownCases` group of
 * `contract/fixtures/template/template-cases.json`.
 *
 *   a part `seconds` anywhere on the screen - every second, otherwise every minute, with none - never.
 *
 * No React and no DOM in this file: the server graph of the entry reads it too.
 */
import { isRecord } from './sanitize'
import type { UiNode } from './types'

/** Mirror of `x-countdown`: the units, and the period of the redraw for each case. */
export const COUNTDOWN = { units: ['days', 'hours', 'minutes', 'seconds'], secondsTickMs: 1000, otherwiseTickMs: 60_000 } as const

/** How deep a node's props are searched for a binding: a template value sits at depth 3 at most; the bound keeps a hostile document cheap. */
const SEARCH_DEPTH = 6

function unitsInto(value: unknown, depth: number, found: Set<string>): void {
  if (depth > SEARCH_DEPTH || !isRecord(value)) return
  if (value.kind === 'binding' && value.format === 'countdownPart' && typeof value.unit === 'string' && (COUNTDOWN.units as readonly string[]).includes(value.unit)) found.add(value.unit)
  for (const entry of Object.values(value)) unitsInto(entry, depth + 1, found)
}

/** The units of the countdown parts a node shows in its props (`content`, a label, a title...). */
export function countdownUnitsOf(props: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const found = new Set<string>()
  unitsInto(props, 0, found)
  return found
}

/** Whether a string field of a node (a binding or a template) shows a countdown part. */
export function showsCountdown(value: unknown): boolean {
  const found = new Set<string>()
  unitsInto(value, 0, found)
  return found.size > 0
}

/** The period of the redraw for the countdown parts a whole tree shows; `undefined` when there are none. */
export function countdownTickOfTree(root: UiNode): 1000 | 60000 | undefined {
  const found = new Set<string>()
  const pending: UiNode[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === undefined) break
    for (const unit of countdownUnitsOf(node.props)) found.add(unit)
    for (const child of node.children ?? []) pending.push(child)
  }
  if (found.size === 0) return undefined
  return found.has('seconds') ? COUNTDOWN.secondsTickMs : COUNTDOWN.otherwiseTickMs
}

/** A moment from the host that the reader trusts: the same test as `readerNow`. Such a moment is the host's clock, and nothing ticks. */
export function isPinnedNow(now: unknown): boolean {
  return (typeof now === 'number' && Number.isFinite(now)) || (now instanceof Date && !Number.isNaN(now.getTime()))
}
