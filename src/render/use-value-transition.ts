/**
 * The data a node SHOWS while it leads a number: from the old value to the new one (schema 9.21.0,
 * `animateChanges`) and from zero when the node is shown (schema 9.24.0, `animateIn`).
 *
 * The node does not learn a second way to read numbers. The hook returns the node's data scope with
 * the counted paths replaced by the number shown at this frame, and the node formats it with its
 * ordinary format, template and plural word. Two scopes come out: `stepped` for the text (and the
 * label of a scale: the number moves in steps), `smooth` for the fill of a scale (no step).
 *
 * WHEN THERE IS NO TRANSITION (the contract order, `decide`): the first render of the node, a node
 * that appears (a new instance mounts), the system "reduce motion", a language changed in the same
 * step, a value that is not a number on either side, the same value. The server render and the
 * first browser frame are therefore exactly the final value: nothing differs on hydration.
 *
 * THE APPEARANCE is the one exception to "the first frame is the final value", and only in the
 * browser: a node that mounts on a shown screen shows zero in its first frame and grows to the
 * value. A node that mounts WHILE HYDRATING does not play it: the markup the server sent already
 * shows the final value, and a drop to zero under the reader's eyes would be worse than no motion.
 * A screen that came from the server therefore does not grow on its first show; every later show
 * (a transition, "back", a node that appears) does. The server render is the final value too.
 *
 * A change during a transition starts from the value shown at that moment and runs the full
 * duration. The frame loop is `requestAnimationFrame`, so a hidden tab stops it and the transition
 * is over when the tab returns.
 */
import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { valueAt } from '../data'
import type { DataScope } from '../data'
import { isRecord } from '../sanitize'
import { animatesIn, appearDecision, appearDigits, appearTargets, VALUE_APPEAR } from '../value-appear'
import { animatesChanges, decide, stepDigits, transitionTargets, transitionValueAt, VALUE_TRANSITION } from '../value-transition'
import type { TransitionTarget } from '../value-transition'
import { PlaceContext, useData } from './contexts'

interface Run {
  readonly from: number
  readonly to: number
  /** Step of the text; the scale label uses the step of its own ends. */
  readonly digits: number
  readonly scale: boolean
  /** The time of the first frame; before it the old value stays. */
  start: number | undefined
}

type Reader = (path: string) => unknown

/** What the node reads in place of its own data: the numbers at the frame being shown. */
export interface Shown {
  readonly stepped: DataScope
  readonly smooth: DataScope
  /** The shown number of a LITERAL value of a scale while it grows (`animateIn`), otherwise `undefined`. */
  readonly literal: { readonly stepped: number; readonly smooth: number } | undefined
  /**
   * The ends of every transition of a SCALE number in progress, by path (the literal value under
   * `#value`): where it started, where it goes and the value shown now. The steps of a bar
   * (9.25.0) take their fractions from the share of the transition already shown.
   */
  readonly ends: ReadonlyMap<string, TransitionEnds>
}

export interface TransitionEnds {
  readonly from: number
  readonly to: number
  readonly shown: number
}

const NO_ENDS: ReadonlyMap<string, TransitionEnds> = new Map()

interface Change {
  readonly localeKey: string
  readonly reducedMotion: boolean
  /** `animateChanges`: a change of the data leads from the shown value; without it the new value is there at once. */
  readonly leads: boolean
}

class Engine {
  mounted = false
  localeKey: string | undefined
  readonly last = new Map<string, unknown>()
  readonly runs = new Map<string, Run>()
  time = 0
  frame: number | undefined

  shownNow(path: string, smooth: boolean): number | undefined {
    const run = this.runs.get(path)
    if (run === undefined) return undefined
    const t = run.start === undefined ? 0 : this.time - run.start
    return transitionValueAt({ from: run.from, to: run.to, t, digits: smooth ? undefined : run.digits })
  }

  /** The appearance: every number of the node starts from zero at the moment it is shown. */
  appear(targets: readonly TransitionTarget[], read: Reader, reducedMotion: boolean): void {
    for (const target of targets) {
      const raw = read(target.path)
      this.last.set(target.path, raw)
      if (appearDecision({ animates: true, to: raw, reducedMotion }) !== true) continue
      const end = raw as number
      this.runs.set(target.path, { from: VALUE_APPEAR.from, to: end, digits: appearDigits(end, target.format, target.currency), scale: target.scale, start: undefined })
    }
  }

  sync(targets: readonly TransitionTarget[], read: Reader, change: Change): void {
    const { localeKey, reducedMotion, leads } = change
    const first = !this.mounted
    const localeChanged = !first && localeKey !== this.localeKey
    this.mounted = true
    this.localeKey = localeKey
    // A language changed in the same step ends an appearance in progress: the final value at once.
    if (localeChanged) this.runs.clear()
    for (const target of targets) {
      const raw = read(target.path)
      if (first || !this.last.has(target.path)) {
        this.last.set(target.path, raw)
        continue
      }
      const before = this.last.get(target.path)
      if (raw === before) continue
      this.last.set(target.path, raw)
      if (!leads) {
        // Without `animateChanges` a change of the data ends the appearance: the new value at once.
        this.runs.delete(target.path)
        continue
      }
      const active = this.runs.get(target.path)
      const shown = active === undefined ? undefined : this.shownNow(target.path, active.scale)
      const from = shown ?? before
      if (decide({ animates: true, shownBefore: true, from, to: raw, localeChanged, reducedMotion }) !== true) {
        this.runs.delete(target.path)
        continue
      }
      const start = from as number
      const end = raw as number
      const digits = stepDigits(start, end, target.format, target.currency)
      this.runs.set(target.path, { from: start, to: end, digits, scale: target.scale, start: undefined })
    }
  }

  scopes(scope: DataScope): Shown {
    if (this.runs.size === 0) return { stepped: scope, smooth: scope, literal: undefined, ends: NO_ENDS }
    const stepped: Record<string, unknown> = { ...scope }
    const smooth: Record<string, unknown> = { ...scope }
    let literal: Shown['literal']
    const ends = new Map<string, TransitionEnds>()
    for (const [path, run] of this.runs) {
      const step = this.shownNow(path, false)
      const flow = run.scale ? this.shownNow(path, true) : step
      if (run.scale) ends.set(path, { from: run.from, to: run.to, shown: flow ?? run.to })
      // A literal value has no path in the data: its shown number travels beside the scopes, never inside them.
      if (path === VALUE_APPEAR.literalKey) {
        literal = { stepped: step ?? run.to, smooth: flow ?? run.to }
        continue
      }
      stepped[path] = step
      smooth[path] = flow
    }
    return { stepped, smooth, literal, ends }
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())

/**
 * Whether this mount is a hydration of server markup. React reads the SERVER snapshot while it
 * hydrates (and on the server), the client one in an ordinary client mount; the first answer is
 * kept for the life of the node.
 */
function useHydrating(): boolean {
  const first = useSyncExternalStore(
    () => () => undefined,
    () => false,
    () => true,
  )
  return useState(first)[0]
}

/** The number of a literal `value`, or `undefined`: a literal of another shape does not appear. */
function literalValue(value: unknown): unknown {
  return isRecord(value) && value.kind === 'literal' ? value.value : undefined
}

/**
 * The data to read in place of the node's own, with the counted numbers at the frame being shown.
 * A node without `animateChanges` or `animateIn` gets its scope back untouched (and the hook costs
 * a few comparisons).
 */
export function useValueTransition(props: Readonly<Record<string, unknown>>): Shown {
  const scope = useData()
  const place = useContext(PlaceContext)
  const engine = useRef<Engine | undefined>(undefined)
  engine.current ??= new Engine()
  const current = engine.current
  const [, redraw] = useState(0)
  const hydrating = useHydrating()
  const leads = animatesChanges(props)
  const appears = animatesIn(props)

  if (leads || appears) {
    const read: Reader = (path) => (path === VALUE_APPEAR.literalKey ? literalValue(props.value) : valueAt(scope, path))
    const reducedMotion = prefersReducedMotion()
    // The appearance starts with the first render of a node that was not hydrated; the scale `max` is not among its numbers.
    if (appears && !current.mounted && !hydrating) current.appear(appearTargets(props), read, reducedMotion)
    const targets = leads ? transitionTargets(props) : appearTargets(props)
    current.sync(targets, read, { localeKey: `${place.shown.translation ?? ''}|${place.shown.formatting ?? ''}`, reducedMotion, leads })
  }

  useEffect(() => {
    if (current.runs.size === 0 || current.frame !== undefined) return
    const step = (): void => {
      current.frame = undefined
      current.time = now()
      for (const [path, run] of current.runs) {
        run.start ??= current.time
        if (current.time - run.start >= VALUE_TRANSITION.durationMs) current.runs.delete(path)
      }
      redraw((count) => count + 1)
      if (current.runs.size > 0) current.frame = requestAnimationFrame(step)
    }
    current.frame = requestAnimationFrame(step)
  })
  useEffect(
    () => () => {
      if (current.frame !== undefined) cancelAnimationFrame(current.frame)
      current.frame = undefined
    },
    [current],
  )

  return current.scopes(scope)
}
