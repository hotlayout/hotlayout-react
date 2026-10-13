/** The error boundary of one screen: a screen that threw is replaced by a notice and the host application stays. */
import { Component } from 'react'
import type { ReactNode } from 'react'

interface ScreenBoundaryProps {
  readonly screenId: string
  readonly resetKey: unknown
  readonly notice: (message: string) => ReactNode
  readonly onError: (message: string) => void
  readonly children: ReactNode
}

interface ScreenBoundaryState {
  readonly failed: { readonly message: string; readonly resetKey: unknown } | undefined
}

/**
 * The error boundary of one screen. A class, because React offers no other way to catch a render
 * exception of descendants. The notice stays until a different document arrives (`resetKey`): the
 * same document would throw again.
 */
export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  override state: ScreenBoundaryState = { failed: undefined }

  static getDerivedStateFromError(error: unknown): Partial<ScreenBoundaryState> {
    // `componentDidCatch` fills in `resetKey`: a static method cannot see props.
    return { failed: { message: messageOf(error), resetKey: PENDING_RESET_KEY } }
  }

  override componentDidCatch(error: unknown): void {
    this.setState({ failed: { message: messageOf(error), resetKey: this.props.resetKey } })
    try {
      this.props.onError(messageOf(error))
    } catch {
      // A host handler that throws while receiving the error report must not take down what the boundary just contained.
    }
  }

  override render(): ReactNode {
    const failed = this.state.failed
    if (failed !== undefined && (failed.resetKey === PENDING_RESET_KEY || failed.resetKey === this.props.resetKey)) return this.props.notice(failed.message)
    return this.props.children
  }
}

const PENDING_RESET_KEY = Symbol('pending')

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300)
}
