/**
 * Haptic feedback of a press (schema 9.25.0, field `haptic` next to `track` on an action). A
 * mirror of the contract's reference rule; the shared table
 * `contract/fixtures/actions/action-cases.json` (group `hapticCases`) keeps the two copies together.
 *
 * It is a REQUEST to the host: the reader never vibrates by itself. It hands the word to the host
 * (`onHaptic`) exactly once per press, BEFORE the analytics event and the action of the same press.
 */

export const HAPTIC_WORDS = ['light', 'medium', 'heavy', 'selection', 'success', 'warning'] as const
export type HapticWord = (typeof HAPTIC_WORDS)[number]

/** The word as the reader takes it: an unknown one is no request. */
export function readHaptic(value: unknown): HapticWord | undefined {
  return HAPTIC_WORDS.find((word) => word === value)
}

/** What the host gets for a press: the word, unless the control is disabled (then there is no press). */
export function hapticRequestOf(action: { readonly haptic?: unknown } | undefined, state: { readonly disabled: boolean }): HapticWord | undefined {
  if (action === undefined || state.disabled) return undefined
  return readHaptic(action.haptic)
}

/** `x-haptic` of the artifact, whole; a test compares the two. */
export const HAPTIC_RULES = {
  prop: 'haptic',
  on: 'any action — next to «type», like «track»',
  words: HAPTIC_WORDS,
  meaning: {
    light: 'a light impact',
    medium: 'a medium impact',
    heavy: 'a heavy impact',
    selection: 'a change of choice',
    success: 'an outcome: done',
    warning: 'an outcome: attention',
  },
  request: 'handed to the host (onHaptic); the reader never vibrates by itself',
  when: 'once per press, before the action, with the analytics event of the same press; also when the action is «none» or the host cancels it',
  order: ['haptic', 'track', 'action'],
  notHanded: 'a disabled button, a key auto-repeat, a press that did not reach the node, a drag to confirm before it completes',
  swipeConfirm: 'when the drag completes, with the action',
  unknown: 'an unknown word is no request',
  noDefault: 'no field — no request, on every widget and action (a section switch too)',
  reducedMotion: 'not motion — the host decides with the settings of the user',
  handedAction: 'the action handed to the host does not carry the field',
  editorCanvas: 'nothing; the preview writes the request into its run log',
  olderReader: 'skips the field — no request',
  cases: 'contract/fixtures/actions/action-cases.json',
} as const
