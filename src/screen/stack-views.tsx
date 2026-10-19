/** What the root of the package draws: the notice for an incompatible document and one layer of the screen stack. */
import type { CSSProperties, ReactNode } from 'react'

import { BACK_ACTION_TYPE } from '../actions'
import type { HotlayoutReport, HotlayoutScreenProps } from '../HotlayoutScreen'
import { modalPlacementOf } from '../media-chrome'
import { isDismissible } from '../sheet-dismiss'
import { CarouselMemoryContext, ScreenView } from '../render'
import type { CarouselMemory, ScreenViewProps } from '../render'
import type { ScreenAnatomy } from '../render/contexts'
import type { ActionHandler } from '../runtime'
import { ROOT_ATTRIBUTE } from '../styles'
import type { ResolvedTheme } from '../theme-resolve'
import type { VersionVerdict } from '../version'
import { modalContentWidthClass, modalShapeInClass } from '../wide-modal'
import type { WidthClass } from '../width-class'
import { rootIdOf } from './flow'
import { FirstPassGuard } from './first-pass'
import type { Flow, ShownFrame } from './flow'
import { ModalLayer, PageLayer } from './layers'
import type { ReportBox } from './reports'
import { ScreenBoundary } from './screen-boundary'

/** Neutral text for the END USER: the reason and details go to `onReport`, not to the screen. */
const UNAVAILABLE = 'This screen is not available right now.'

/** The root for a document of an incompatible schema major: the notice of the host or the built-in one. */
export function incompatibleRoot({
  verdict,
  version,
  className,
  style,
  renderIncompatible,
}: {
  readonly verdict: Extract<VersionVerdict, { kind: 'incompatible' }>
  readonly version: string
  readonly className: string | undefined
  readonly style: CSSProperties | undefined
  readonly renderIncompatible: HotlayoutScreenProps['renderIncompatible']
}): ReactNode {
  return (
    <div {...{ [ROOT_ATTRIBUTE]: '' }} className={className} style={style}>
      {renderIncompatible === undefined ? (
        /*
         * Text for the end user, not the developer (the reason and versions go to `onReport`). A
         * newer major means the app is outdated, which the user can fix; any other cause they
         * cannot, so "update" would be advice they cannot follow.
         */
        <div role="alert">{verdict.relation === 'document-newer' ? 'Update the app to see this screen.' : UNAVAILABLE}</div>
      ) : (
        renderIncompatible(verdict, version)
      )}
    </div>
  )
}

/** What every layer of one render shares. */
export interface LayerEnv {
  /** The props of `ScreenView` that are the same for every screen of the stack. */
  readonly screenProps: Omit<ScreenViewProps, 'screenId' | 'root' | 'widthClass' | 'record' | 'links' | 'anatomy'>
  /** The index of the lowest drawn frame: the highest page of the stack. */
  readonly base: number
  readonly widthClass: WidthClass
  readonly anatomy: ScreenAnatomy
  readonly resolved: ResolvedTheme
  readonly renderError: HotlayoutScreenProps['renderError']
  readonly flowKey: string
  readonly issues: ReportBox
  readonly deliver: (report: HotlayoutReport) => void
  readonly memoryFor: (scope: string) => CarouselMemory
  readonly sectionSuffix: string
  readonly current: Flow
  readonly handleAction: ActionHandler
}

/** One drawn frame of the stack: the page, or a modal layer over it. */
export function stackLayer(env: LayerEnv, { screen, record, links }: ShownFrame, offset: number): ReactNode {
  const { screenProps, base, widthClass, anatomy, resolved, renderError, flowKey, issues, deliver, memoryFor, sectionSuffix, current, handleAction } = env
  const index = Math.max(base, 0) + offset
  const isModal = offset > 0
  // How the layer is shown (since 9.18.0): decided by the width class of the AREA, while the layer's content reads the class of its own box.
  const shape = modalShapeInClass(screen.modalPlacement, widthClass)
  const view = (
    <ScreenView
      {...screenProps}
      screenId={screen.screenId}
      root={screen.root}
      widthClass={isModal ? modalContentWidthClass(screen.modalPlacement, widthClass) : widthClass}
      record={record}
      links={links}
      anatomy={isModal ? { ...anatomy, modal: true, windowed: shape !== 'sheet', sheetWindow: shape === 'sheetWindow' } : anatomy}
    />
  )
  /*
   * Error boundary around the screen. Defensive reading (`shape.ts`, `sanitize.ts`) should stop a
   * screen from throwing; this boundary covers whatever it missed. Without it, a render exception
   * unmounts the host application's WHOLE tree, so one bad node in storage would blank the host's
   * page. `ScreenBoundary` catches in the browser. On the server there are no error boundaries, so
   * the first pass guards itself (`FirstPassGuard`): the same notice goes into the markup instead of
   * a 500 for the whole page. `Suspense` would stop a server exception too, but a streaming renderer
   * sends the fallback of a large boundary first and its content later, so a healthy screen would
   * reach the reader as the notice.
   */
  const notice = (message: string): ReactNode => (renderError === undefined ? <div role="alert">{UNAVAILABLE}</div> : renderError({ screenId: screen.screenId, message }))
  const guarded = (
    <ScreenBoundary
      screenId={screen.screenId}
      // A different document or entry is a new attempt. NOT "a different object": a host that
      // parses JSON during render hands over a new object every time, and the same document
      // would throw again on every render.
      resetKey={flowKey}
      notice={notice}
      onError={(message) => {
        // The boundary catches in the commit phase, when the report box has already been drained, so deliver at once, but still only once.
        if (issues.note({ kind: 'render-error', screenId: screen.screenId, message })) for (const report of issues.drain()) deliver(report)
      }}
    >
      <FirstPassGuard notice={notice}>
        <CarouselMemoryContext.Provider value={memoryFor(`${String(index + 1)}-${screen.screenId}${sectionSuffix}`)}>{view}</CarouselMemoryContext.Provider>
      </FirstPassGuard>
    </ScreenBoundary>
  )
  const key = `${String(index + 1)}-${screen.screenId}${sectionSuffix}`
  if (!isModal) {
    return (
      <PageLayer key={key} screenId={screen.screenId} takeFocus={current.moved} ownHeight={anatomy.scroll === 'screen'}>
        {guarded}
      </PageLayer>
    )
  }
  return (
    <ModalLayer
      key={key}
      screenId={screen.screenId}
      name={screen.name}
      placement={modalPlacementOf(screen.modalPlacement)}
      shape={shape}
      theme={resolved.theme}
      ownHeight={anatomy.scroll === 'screen'}
      backdropBlur={screen.backdropBlur}
      dismissible={isDismissible(screen)}
      trapFocus={anatomy.trapFocus === true}
      onDismiss={() => {
        // The scrim and Esc are `navigate.back`, not a separate action: a second way back would drift apart from the first.
        handleAction({ type: BACK_ACTION_TYPE }, record === undefined ? { nodeId: rootIdOf(screen), screenId: screen.screenId } : { nodeId: rootIdOf(screen), screenId: screen.screenId, record })
      }}
    >
      {guarded}
    </ModalLayer>
  )
}
