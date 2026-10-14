/** The guard of a screen layer's first render pass: a part that throws ends the pass with the notice instead of an exception. */
import { Fragment, useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { FirstPass, FirstPassContext } from '../render/screen-part'
import { FAILED_PASS_ATTRIBUTE } from '../styles'

/** A pre-paint effect in the browser; on the server `useLayoutEffect` warns, and effects do not run there anyway. */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

interface FirstPassGuardProps {
  readonly notice: (message: string) => ReactNode
  readonly children: ReactNode
}

/**
 * Guards the first pass of one layer (`render/screen-part.ts`).
 *
 * The pass is the same on the server and in the browser that hydrates its markup: the parts up to
 * the one that threw, then the notice. So a response is never lost to one screen, and hydration
 * finds what the server sent. After the first commit the guard is off for good. A healthy screen
 * is not rendered again for that. A failed one is mounted anew, unguarded, so the exception
 * reaches the error boundary around the layer, which replaces the layer with the notice and
 * reports the error. Anew, not updated: a part that threw halfway left hooks React cannot update.
 */
export function FirstPassGuard({ notice, children }: FirstPassGuardProps): ReactNode {
  const [{ pass, attempt }, setAttempt] = useState(() => ({ pass: new FirstPass(true), attempt: 0 }))
  pass.restart()
  useIsomorphicLayoutEffect(() => {
    if (!pass.guarded) return
    if (pass.failed === undefined) pass.finish()
    else setAttempt({ pass: new FirstPass(false), attempt: attempt + 1 })
  }, [pass, attempt])
  return (
    <FirstPassContext.Provider value={pass}>
      <Fragment key={attempt}>{children}</Fragment>
      <FailedPassNotice pass={pass} notice={notice} />
    </FirstPassContext.Provider>
  )
}

/** Drawn AFTER the screen, in the same pass: by then the pass knows whether a part threw. */
function FailedPassNotice({ pass, notice }: { readonly pass: FirstPass; readonly notice: (message: string) => ReactNode }): ReactNode {
  if (!pass.guarded || pass.failed === undefined) return null
  return <div {...{ [FAILED_PASS_ATTRIBUTE]: '' }}>{notice(pass.failed)}</div>
}
