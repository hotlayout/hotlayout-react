/** What a press does to the stack: the action handler of the screens — a section switch, a push, a step back, or the host. */
import type { Dispatch, SetStateAction } from 'react'

import { intentOf } from '../actions'
import type { ActionSource, HotlayoutAction, TrackEvent } from '../actions'
import { sectionStackOf } from '../bottom-zone'
import type { HotlayoutReport, NavigationEvent, ScreenInfo } from '../HotlayoutScreen'
import { recordForOpenedScreen } from '../record-scope'
import type { ActionHandler, PressExtras } from '../runtime'
import type { ScreenEntry } from '../types'
import { infoOf } from './flow'
import type { Flow } from './flow'
import type { ReportBox } from './reports'

/** What the handler of one render sees: the stack as it is drawn and the handlers of the host. */
export interface NavigationEnv {
  readonly issues: ReportBox
  readonly deliver: (report: HotlayoutReport) => void
  readonly onTrack: ((event: TrackEvent, source: ActionSource) => void) | undefined
  readonly onAction: ((action: HotlayoutAction, source: ActionSource) => void) | undefined
  readonly onNavigate: ((event: NavigationEvent) => boolean | undefined) | undefined
  readonly screens: readonly ScreenEntry[]
  readonly frames: readonly ScreenEntry[]
  readonly topInfo: ScreenInfo | undefined
  readonly current: Flow
  readonly setFlow: Dispatch<SetStateAction<Flow>>
}

/** One press: the checked action, where it came from and what it carries. */
interface Press {
  readonly safe: HotlayoutAction
  readonly source: ActionSource
  readonly insideListItem: boolean
  readonly extras: PressExtras | undefined
}

function switchSection(env: NavigationEnv, topInfo: ScreenInfo, intent: { readonly screenId: string }, { safe, source }: Press): void {
  const { screens, current, onNavigate, setFlow } = env
  /*
   * Section switch (since 9.12.0, `sectionStackOf`): the stack becomes ONE named screen, everything
   * above it (modal layers included) is closed, and no record is carried. If the stack already is
   * that screen, nothing happens, not even an event. A section declared modal is still a page: it is
   * the bottom of the stack. The analytics event has already been sent (see the handler below); if
   * the host cancels the navigation, nothing is shown.
   */
  if (sectionStackOf(current.stack.map((frame) => frame.screenId), intent.screenId) === undefined) return
  const target = screens.find((screen) => screen.screenId === intent.screenId)
  if (target === undefined) return
  if (onNavigate?.({ kind: 'switch', from: topInfo, to: infoOf(target, true), action: safe, source }) === false) return
  setFlow({ ...current, stack: [{ screenId: intent.screenId }], moved: true, show: current.show + 1, cause: 'switch', sections: current.sections + 1 })
}

function pushScreen(env: NavigationEnv, topInfo: ScreenInfo, intent: { readonly screenId: string }, { safe, source, insideListItem, extras }: Press): void {
  const { screens, current, onNavigate, setFlow } = env
  const target = screens.find((screen) => screen.screenId === intent.screenId)
  if (target === undefined) return
  const to = infoOf(target, false)
  if (onNavigate?.({ kind: 'push', from: topInfo, to, action: safe, source }) === false) return
  /*
   * Which record the screen opens with (since 9.2.0, `record-scope.ts`): from a list row, the row
   * record; not from a row, a page without a record, while a modal layer sees the record of the
   * screen below it.
   */
  const record = recordForOpenedScreen({ nodeRecord: source.record, insideListItem, presentation: to.presentation, carryRecord: extras?.carryRecord })
  setFlow({ ...current, stack: [...current.stack, record === undefined ? { screenId: intent.screenId } : { screenId: intent.screenId, record }], moved: true, show: current.show + 1, cause: 'forward' })
}

function stepBack(env: NavigationEnv, topInfo: ScreenInfo, { safe, source }: Press): void {
  const { frames, current, onNavigate, setFlow } = env
  const previous = frames[frames.length - 2]
  if (previous === undefined) return
  if (onNavigate?.({ kind: 'back', from: topInfo, to: infoOf(previous, frames.length === 2), action: safe, source }) === false) return
  setFlow({ ...current, stack: current.stack.slice(0, -1), moved: true, show: current.show + 1, cause: 'back' })
}

export function actionHandlerOf(env: NavigationEnv): ActionHandler {
  const { issues, deliver, onTrack, onAction, screens, frames, topInfo } = env
  return (safe: HotlayoutAction, source: ActionSource, insideListItem = false, extras?: PressExtras): void => {
    // What the reader ignored in an action (a field of the wrong shape) is noticed at press time, not at render time: there may be no render to deliver the report from an effect.
    for (const report of issues.drain()) deliver(report)
    // The press's analytics event goes FIRST and exactly once: before a transition (even one the host cancels), before a delegated action, and for `none` too.
    if (extras?.track !== undefined) onTrack?.(extras.track, source)
    // The action arrives here already CHECKED (`preparePress`): parameters are own identifier keys
    // with string values, no `__proto__` or `constructor`, with data from `paramBindings` and a
    // `standard` / `invalid` verdict; the record in `source.record` has own keys of the data-path
    // shape only (`safeRecordOf`).
    const intent = intentOf(
      safe,
      screens.map((screen) => screen.screenId),
      frames.length,
    )
    if (intent.kind === 'inert') return
    if (intent.kind === 'host' || topInfo === undefined) {
      onAction?.(safe, source)
      return
    }

    const press: Press = { safe, source, insideListItem, extras }
    if (intent.kind === 'section') switchSection(env, topInfo, intent, press)
    else if (intent.kind === 'push') pushScreen(env, topInfo, intent, press)
    else stepBack(env, topInfo, press)
  }
}
