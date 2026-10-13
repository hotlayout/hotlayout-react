/** The session of the reader: what the user wrote into inputs, kept for the lifetime of a flow. */
import { useEffect, useMemo, useRef, useState } from 'react'

import type { DataScope } from '../data'
import { NO_SESSION, pruneSession, sessionScope, writeSession } from '../input-session'
import type { SessionEntries } from '../input-session'

export function useInputSession(flowKey: string, data: DataScope): { readonly session: DataScope | undefined; readonly writeSessionValue: (path: string, value: string | boolean | number) => void } {
  /*
   * The reader session (since 9.13.0): what the user wrote into inputs. It lives as long as the flow
   * (the same `flowKey`), so it survives transitions between screens. An entry whose base value in
   * `data` has changed (the host supplied its own) is dropped for good.
   */
  const [sessionState, setSessionState] = useState<{ readonly key: string; readonly entries: SessionEntries }>({ key: flowKey, entries: NO_SESSION })
  const sessionHeld = sessionState.key === flowKey ? sessionState.entries : NO_SESSION
  const sessionLive = pruneSession(sessionHeld, data)
  if (sessionState.key !== flowKey || sessionLive !== sessionState.entries) setSessionState({ key: flowKey, entries: sessionLive })
  const session = useMemo(() => sessionScope(sessionLive), [sessionLive])
  const latestData = useRef(data)
  useEffect(() => {
    latestData.current = data
  })
  const writeSessionValue = (path: string, value: string | boolean | number): void => {
    setSessionState((held) => ({ key: flowKey, entries: writeSession(held.key === flowKey ? held.entries : NO_SESSION, path, value, latestData.current) }))
  }
  return { session, writeSessionValue }
}
