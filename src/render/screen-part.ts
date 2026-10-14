/**
 * The first render pass of a screen, guarded part by part.
 *
 * React has error boundaries in the browser only. On the server an exception stops the whole
 * response, and the one thing that would contain it, `Suspense`, also lets a streaming renderer
 * send its fallback first and the content later, so a healthy screen would arrive behind a
 * placeholder. The screen therefore guards itself: during the first pass (the server render, the
 * hydration over it, the first render in a browser) every component of the screen tree runs inside
 * `try`, and the first one that throws ends the pass: nothing more of the screen is drawn and the
 * notice follows (`FirstPassGuard`). Later passes are not guarded, and an exception goes to the
 * error boundary, as any React render error does.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * One screen layer in its first pass. A class rather than state: it is written WHILE the parts
 * render, because the parts after the one that threw must see the failure in the same pass, and its
 * only side effect is remembering that.
 */
export class FirstPass {
  private open: boolean
  private message: string | undefined = undefined

  constructor(guarded: boolean) {
    this.open = guarded
  }

  /** Whether the parts still catch what they throw. */
  get guarded(): boolean {
    return this.open
  }

  /** The message of the part that threw in this pass. */
  get failed(): string | undefined {
    return this.message
  }

  /** A new attempt at the same pass: an abandoned render must not leave its failure to the next one. */
  restart(): void {
    if (this.open) this.message = undefined
  }

  fail(thrown: unknown): void {
    this.message = (thrown instanceof Error ? thrown.message : String(thrown)).slice(0, 300)
  }

  /** The first pass was committed: from now on an exception belongs to the error boundary. */
  finish(): void {
    this.open = false
  }
}

/** Absent outside a guarded layer: a part then behaves as a plain component. */
export const FirstPassContext = createContext<FirstPass | undefined>(undefined)

/**
 * A component of the screen tree. The wrapper calls the component as a function, so its hooks
 * belong to the same component for React and identifiers from `useId` do not change.
 */
export function screenPart<P>(render: (props: P) => ReactNode): (props: P) => ReactNode {
  function Part(props: P): ReactNode {
    const pass = useContext(FirstPassContext)
    if (pass?.guarded !== true) return render(props)
    if (pass.failed !== undefined) return null
    try {
      return render(props)
    } catch (thrown) {
      if (isFrameworkSignal(thrown)) throw thrown
      pass.fail(thrown)
      return null
    }
  }
  Part.displayName = render.name
  return Part
}

/** What a framework throws to steer rendering (a promise to wait for, an error with a `digest`) is not a failure of the screen. */
function isFrameworkSignal(thrown: unknown): boolean {
  if (typeof thrown !== 'object' || thrown === null) return false
  const signal = thrown as { readonly then?: unknown; readonly digest?: unknown }
  return typeof signal.then === 'function' || typeof signal.digest === 'string'
}
