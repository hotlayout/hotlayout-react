/** The state of the screen stack: a new flow for another document or entry, and for a new version that lost a screen of the stack. */
import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { stackSurvivesNewVersion } from '../screen-shown'
import type { ScreenEntry, UiDocument } from '../types'
import { screensOf } from './flow'
import type { Flow, Frame } from './flow'

export function useScreenFlow(
  document: UiDocument,
  flowKey: string,
  start: { readonly screenId: string | undefined },
): { readonly current: Flow; readonly setFlow: Dispatch<SetStateAction<Flow>>; readonly screens: readonly ScreenEntry[] } {
  /*
   * The screen stack. A different document OR a different entry starts a new flow: the old stack
   * has nothing to do with it. The second case matters: the host changes the entry when the user
   * arrives through another link, and keeping the old history would make "back" lead into someone
   * else's flow.
   *
   * "A different document" means a different `documentId`, NOT a different object. A host often
   * parses JSON during render or re-reads the published file: the object is new every time while
   * the document is the same, and resetting the stack would throw the user back to the first screen
   * mid-flow (and, with an `onScreenChange` that sets host state, loop the render). Stack screens
   * are looked up by `screenId` in the CURRENT document on every render, so a new version of the
   * same document is drawn at once.
   *
   * The reset happens during render rather than in an effect: an effect would paint one frame of
   * the old stack with the new document.
   */
  const initialStack = (): readonly Frame[] => (start.screenId === undefined ? [] : [{ screenId: start.screenId }])
  const [flow, setFlow] = useState<Flow>(() => ({ key: flowKey, stack: initialStack(), restarts: 0, moved: false, show: 0, cause: 'entry', sections: 0 }))
  const screens = useMemo(() => screensOf(document), [document])
  let current = flow
  /*
   * A new version of the same document that lacks AT LEAST ONE screen of the stack is also a new
   * flow (`stackScreenGone: 'restart-from-entry'`): the entry screen of the NEW version, show event
   * `entry`, depth 1. It does not "trim to the deepest surviving frame": the user was looking at a
   * different document, and continuing from its middle would invent a flow. No ghost frames (a
   * screen that no longer exists under a popped one) are left behind.
   */
  const stackGone = flow.stack.length > 0 && !stackSurvivesNewVersion(flow.stack.map((frame) => frame.screenId), screens.map((screen) => screen.screenId))
  if (flow.key !== flowKey || stackGone || (flow.stack.length === 0 && start.screenId !== undefined)) {
    current = { key: flowKey, stack: initialStack(), restarts: flow.key === flowKey ? flow.restarts + 1 : 0, moved: false, show: 0, cause: 'entry', sections: 0 }
    setFlow(current)
  }
  return { current, setFlow, screens }
}
