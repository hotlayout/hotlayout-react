/**
 * Press: from an action in the document to what goes to the host (schema 9.8.0).
 *
 * An action arrives over the network, so it is UNTRUSTED input: whatever lacks the form the
 * schema promises is ignored with a report (`ignored-input`), and the rest of the action still
 * works. The rules are the contract reference implementation's (`action-catalog.ts`, a verbatim
 * mirror):
 *
 *  - a parameter from data (`paramBindings`) is read through the node's scope at the moment of
 *    the press; only a non-empty string up to 2048 characters counts as a value, otherwise the
 *    literal from `params` applies;
 *  - a catalog action executed by the host travels with a verdict: `standard` (the parameters
 *    passed their form) or `invalid` (they did not); the two never occur together;
 *  - `track` is the analytics event of the press; the handed-over action does not contain it;
 *  - `haptic` is a request to the host for a tactile response (one word of a closed list); an unknown word is no request, and the handed-over action does not contain it;
 *  - `carryRecord` is exactly `true`.
 *
 * Nothing is opened here. Executing a standard action lives only in `standard-actions.ts`, and
 * the HOST calls it.
 */
import { handedAction, isParamKey, TRACK_EVENT_MAX, TRACK_NAME_PATTERN, TRACK_PARAM_KEY_MAX, TRACK_PARAM_VALUE_MAX, TRACK_PARAMS_MAX } from './action-catalog'
import type { HandedAction } from './action-catalog'
import type { HotlayoutAction, TrackEvent } from './actions'
import { readHaptic } from './haptic'
import type { HapticWord } from './haptic'
import { FORBIDDEN_SEGMENTS, isRecord, safeDataPath, safeParams } from './sanitize'
import type { InputIssue } from './shape'

/** Everything the screen learns from one document action at the moment of a press. */
export interface Press {
  /** The action the host receives (or the screen itself executes, if it is a navigation). */
  readonly action: HotlayoutAction
  /** The analytics event: the host receives it BEFORE anything else; `undefined` when the action carries none. */
  readonly track?: TrackEvent
  /** The haptic request of the press (`haptic`): the host receives it before the analytics event; `undefined` when the action carries no known word. */
  readonly haptic?: HapticWord
  /** Whether the action asks to carry the record to a page not opened from a row (exactly `carryRecord: true`). */
  readonly carryRecord: boolean
}

/** A form for the report: a long or hostile string does not bloat it. */
const shortened = (value: string): string => value.slice(0, 40)

/** `paramBindings`: own identifier keys, values are data paths. Anything else goes to the report. */
function bindingsOf(value: unknown, report: (reason: string) => void): Readonly<Record<string, string>> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    report('paramBindings is not an object; the bindings were ignored')
    return undefined
  }
  const bindings: Record<string, string> = {}
  const dropped: string[] = []
  for (const name of Object.keys(value)) {
    const path = value[name]
    if (!isParamKey(name) || safeDataPath(path) === undefined) dropped.push(shortened(name))
    else bindings[name] = path as string
  }
  if (dropped.length > 0) report(`parameter bindings that are not a data path of a parameter were ignored: ${dropped.slice(0, 5).join(', ')}`)
  return bindings
}

/** `track`: all or nothing. An event assembled from surviving pieces would not be the one the author described. */
function trackOf(value: unknown, report: (reason: string) => void): TrackEvent | undefined {
  if (value === undefined || value === null) return undefined
  const event = isRecord(value) ? value.event : undefined
  if (!isRecord(value) || typeof event !== 'string' || event.length > TRACK_EVENT_MAX || !TRACK_NAME_PATTERN.test(event)) {
    report('track is not an event of the form the contract names; no analytics event is sent')
    return undefined
  }
  const raw = value.params
  if (raw === undefined || raw === null) return Object.freeze({ event })
  const params: Record<string, string> = {}
  let bad = !isRecord(raw)
  if (isRecord(raw)) {
    const keys = Object.keys(raw)
    if (keys.length > TRACK_PARAMS_MAX) bad = true
    for (const key of keys) {
      const entry = raw[key]
      if (key.length > TRACK_PARAM_KEY_MAX || !TRACK_NAME_PATTERN.test(key) || FORBIDDEN_SEGMENTS.includes(key) || typeof entry !== 'string' || entry.length > TRACK_PARAM_VALUE_MAX) {
        bad = true
        break
      }
      params[key] = entry
    }
  }
  if (bad) {
    report('track.params is not a flat map of the form the contract names; no analytics event is sent')
    return undefined
  }
  return Object.freeze(Object.keys(params).length === 0 ? { event } : { event, params: Object.freeze(params) })
}

function frozen(handed: HandedAction): HotlayoutAction {
  const result: Record<string, unknown> = { type: handed.type }
  if (handed.params !== undefined) result.params = Object.freeze({ ...handed.params })
  if (handed.standard !== undefined) result.standard = Object.freeze({ ...handed.standard })
  if (handed.invalid !== undefined) result.invalid = Object.freeze({ ...handed.invalid })
  return Object.freeze(result) as unknown as HotlayoutAction
}

/**
 * Whether the action carries analytics that a press sends: the same check a press makes (a `track` of a wrong
 * shape is ignored whole). A node whose action is `none` and carries this is still pressable.
 */
export function carriesTrack(action: { readonly type: string }): boolean {
  return preparePress(action, () => undefined, () => undefined, '').track !== undefined
}

/**
 * A document action to a {@link Press}. `raw` is exactly what lies in `props.action` (the
 * `type: string` shape has already been checked by `actionOf`); `read` resolves a data path
 * through the node's scope AT THE MOMENT OF THE PRESS.
 */
export function preparePress(raw: { readonly type: string }, read: (path: string) => unknown, report: (issue: InputIssue) => void, where: string): Press {
  const note = (reason: string): void => {
    report({ where, reason })
  }
  const source = raw as unknown as Readonly<Record<string, unknown>>

  const { params, dropped } = safeParams(source.params)
  if (dropped.length > 0) note(`action params that are not plain string values were dropped: ${dropped.slice(0, 5).join(', ')}`)
  const paramBindings = bindingsOf(source.paramBindings, note)

  const handed = handedAction({ type: raw.type, ...(params === undefined ? {} : { params }), ...(paramBindings === undefined ? {} : { paramBindings }) }, read)

  const track = trackOf(source.track, note)
  if (source.carryRecord !== undefined && source.carryRecord !== true) note('carryRecord is not `true`; the field was ignored')

  const haptic = readHaptic(source.haptic)

  return { action: frozen(handed), ...(track === undefined ? {} : { track }), ...(haptic === undefined ? {} : { haptic }), carryRecord: source.carryRecord === true }
}
