/**
 * Renderer entry for one screen: document tree -> React.
 *
 * This file takes a screen's root and prepares everything the nodes below need: input guards,
 * the tree resolved for the width class, the data layers, the locale answer, the clock, the
 * host boundary and the screen contexts. Nodes are drawn by `render/node-view.tsx`; widgets
 * live under `render/`. Appearance is written INLINE from theme variables (no class per
 * widget), so a host stylesheet cannot override it and tests read it the same way.
 *
 * THE ORDER MATTERS MOST. Every node goes through five steps in the same sequence:
 *
 *   1. visibility (`visibleIf`): an invisible node is not drawn at all;
 *   2. effective style (`style` + the first applicable `styleWhen`);
 *   3. foreground: its own `color` / `typography` or inherited ones, which is what is passed to
 *      the children;
 *   4. box (`margin`, size, background, border, radius, shadow, opacity, `padding`), the same on
 *      every type;
 *   5. the widget itself: only content, behavior and child layout from `props`.
 *
 * Swapping 1 and 2 is tempting (less work on hidden nodes) and wrong: a state may depend on the
 * same data. And 3 MUST come after 2: the style that is inherited includes the state
 * (`x-style.inheritance: 'after-case-merge'`).
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'

import type { ActionSource } from './actions'
import { withCollections, withScreenRecord } from './data'
import type { DataScope } from './data'
import { directionOf } from './direction'
import type { TextDirection } from './direction'
import { isFormFilled } from './form-rules'
import { guardRoot, withoutForbiddenKeys } from './guards'
import { DEFAULT_IMAGES } from './images'
import type { ImagePolicy } from './images'
import type { LocaleResolution } from './locale'
import { resolveDocumentLocale } from './localization'
import type { RecordChain } from './live-record'
import { overlayRecord } from './record-scope'
import { AnatomyContext, CollectionsContext, DEFAULT_ANATOMY, DataContext, ImageContext, IssueContext, NO_RECORD, PlaceContext, RecordContext, TextContext, ThemeContext, WidthClassContext } from './render/contexts'
import type { RecordPlace, ScreenAnatomy } from './render/contexts'
import { ListBudgetContext, useListBudget } from './render/list-budget'
import { hostWriters, safeRecordOf } from './render/host-boundary'
import { isPinnedNow } from './countdown'
import { CountdownClock } from './render/countdown-clock'
import { NodeView } from './render/node-view'
import { ActionContext, AssetContext, AutofillContext, DEFAULT_LABELS, DirectionContext, FormContext, InputWriteContext, LabelsContext, WriteContext } from './runtime'
import type { ActionHandler, PressOutcome, ScreenLabels, WriteHandler } from './runtime'
import { promiseOf } from './swipe-busy'
import type { SwipeActionRunner } from './swipe-busy'
import { isRecord } from './sanitize'
import { shapeRoot } from './shape'
import type { IssueSink } from './shape'
import { ROOT_TEXT_STYLE } from './style'
import { readerNow } from './text-template'
import type { Theme } from './theme'
import type { LocalizationSection, UiNode } from './types'
import { nodeInWidthClass, widthClassWord } from './width-class'
import type { WidthClass } from './width-class'
import { screenPart } from './render/screen-part'

export { CarouselMemoryContext, DEFAULT_ANATOMY, MAX_COLLECTION_ITEMS, WidthClassContext, useData, type CarouselMemory, type ScreenAnatomy } from './render/contexts'
export { safeRecordOf, writablePathOf } from './render/host-boundary'
export { openTabOf } from './render/tabs'

export interface ScreenViewProps {
  readonly screenId: string
  readonly root: UiNode
  /**
   * Width class the screen is drawn in (9.18.0): measured by `HotlayoutScreen` (the box of the
   * package root). The tree is resolved for the class HERE, once per class or document change.
   * `compact` by default, as before the first measurement.
   */
  readonly widthClass?: WidthClass | undefined
  /**
   * Theme to draw with. REQUIRED since 9.0.0: without it there is no way to tell whether a token
   * the document names exists, and whether a property is drawn depends on that. Theme variables
   * are attached higher up, on the `HotlayoutScreen` root.
   */
  readonly theme: Theme
  readonly data: DataScope
  /**
   * The record the screen was opened with (9.2.0): the list row that was clicked to arrive here.
   * The strongest data layer of the screen; without it, as before.
   */
  readonly record?: DataScope | undefined
  /** The links that record is made of (9.27.0): the lists it came from, so a press inside the page hands them on. Without them the record never follows the data. */
  readonly links?: RecordChain | undefined
  readonly collections?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> | undefined
  readonly localization?: LocalizationSection | undefined
  /**
   * The locale the HOST asked for (usually the device locale: `ar-EG`, `pt_BR`), as is. The
   * language the screen is shown in is decided by `resolveDocumentLocale`.
   */
  readonly locale?: string | undefined
  /** An already computed locale answer, so the root and the screen do not compute it twice. */
  readonly shown?: LocaleResolution | undefined
  /** Time zone (IANA) in which dates are written. Without it, the zone of whoever draws. */
  readonly timeZone?: string | undefined
  /**
   * The reader's "now": epoch milliseconds or a `Date` (`readerClock`). `daysUntil` is counted
   * from it. Without it, the clock of whoever draws, read at draw time; a screen that shows a
   * countdown part (9.21.0) then draws itself again as time passes. A moment given by the host is
   * the host's clock: nothing ticks.
   */
  readonly now?: number | Date | undefined
  /**
   * Whether `now` is the host's moment (the screen stack passes ONE instant to all its layers, so a
   * number here does not say who chose it). Without it, a valid `now` counts as the host's.
   */
  readonly nowPinned?: boolean | undefined
  /** Writing direction. Without it, from the language the document is SHOWN in. */
  readonly direction?: TextDirection | undefined
  /** The handler of the screen stack returns what the press learned (`PressOutcome`); a plain handler may return anything. */
  readonly onAction?: ((...args: Parameters<ActionHandler>) => unknown) | undefined
  readonly onWrite?: WriteHandler | undefined
  readonly assets?: Readonly<Record<string, string>> | undefined
  readonly labels?: ScreenLabels | undefined
  /** Image policy (`images.ts`). Without it, only absolute `https:` addresses. */
  readonly images?: ImagePolicy | undefined
  /**
   * Paths the document may WRITE to (`onWrite`). If given, writing is allowed only to the
   * listed ones; if not, to any path of a valid shape.
   */
  readonly writablePaths?: readonly string[] | ((path: string) => boolean) | undefined
  /**
   * READER SESSION (9.13.0): what the person wrote into input fields during the run. A layer
   * between the screen record and the host data (`DATA_LAYER_ORDER`); `HotlayoutScreen` holds it
   * so it survives navigation between screens.
   */
  readonly session?: DataScope | undefined
  /** Write of an input field into the session (the path is already checked). Without it the field writes only to the host. */
  readonly onSessionWrite?: ((path: string, value: string | boolean | number) => void) | undefined
  /** Whether to ask the platform for autofill hints (the host prop `autofill`); on by default. */
  readonly autofill?: boolean | undefined
  /**
   * Rejection of a FIELD write (path not in the host's list): the report must go to the host at
   * once, because the write happened in an event handler, not during drawing, and there may be
   * no next draw of the screen whose effect emits reports.
   */
  readonly onWriteRefused?: IssueSink | undefined
  /** Where whatever the reader ignored in the input goes (`shape.ts`, `sanitize.ts`). */
  readonly onIssue?: IssueSink | undefined
  /** Where the screen lives: in a block with a page or in an area with its own height (9.9.0). `page` by default. */
  readonly anatomy?: ScreenAnatomy | undefined
}

const NO_ISSUES: IssueSink = () => undefined

const NO_ASSETS: Readonly<Record<string, string>> = {}
const NO_ACTION: ActionHandler = () => undefined

/** What a press learned, or nothing: a handler that is not the screen stack returns whatever it likes, and only the exact shape counts. */
function outcomeOf(value: unknown): PressOutcome | undefined {
  if (!isRecord(value) || !SWIPE_RUNNERS.includes(value.runner as SwipeActionRunner)) return undefined
  return { runner: value.runner as SwipeActionRunner, answer: promiseOf(value.answer) }
}
const SWIPE_RUNNERS: readonly SwipeActionRunner[] = ['reader', 'host', 'none', 'invalid']

/**
 * THE SCREEN ROOT HAS NO `showOn` FIELD (`widthClass.showOn.on: 'every-node-but-the-screen-root'`):
 * what is not in the contract the reader does not read. The screen is shown because it was
 * navigated to; a root hidden by class would give an empty page with no report, and in a modal
 * layer (whose content class comes from its own box) just the scrim at every width. The field is
 * removed HERE, once per screen: visibility is then asked in one place (`nodeShown`), and the
 * screen form (`isFormFilled`) sees the same root.
 */
function withoutRootShowOn(root: UiNode): UiNode {
  if (!Object.hasOwn(root, 'showOn')) return root
  const rest: UiNode = { ...root }
  Reflect.deleteProperty(rest, 'showOn')
  return rest
}

/** One screen with data: no stack, no theme on the root and no wrapper element of its own. */
export const ScreenView = screenPart(function ScreenView({
  screenId,
  root,
  theme,
  data,
  record,
  links,
  collections = {},
  localization,
  locale,
  shown: shownByParent,
  timeZone,
  now,
  nowPinned,
  direction,
  onAction = NO_ACTION,
  onWrite,
  assets = NO_ASSETS,
  labels = DEFAULT_LABELS,
  images = DEFAULT_IMAGES,
  writablePaths,
  session,
  onSessionWrite,
  autofill = true,
  onWriteRefused,
  onIssue = NO_ISSUES,
  anatomy = DEFAULT_ANATOMY,
  widthClass = 'compact',
}: ScreenViewProps): ReactNode {
  /*
   * INPUT GUARDS, before any render. FIRST the SHAPE (`shape.ts`): what is not a node is
   * dropped, so the tree walk no longer throws. Then depth (`guards.ts`): a tree deeper than the
   * limit is a refusal said aloud, not a stack that overflows on the third screen. An own
   * `__proto__` key is dropped as an ENTRY (`protoKeyWithoutValidation: 'drop-entry'`): the rest
   * of the screen is drawn.
   */
  const shaped = useMemo(() => {
    const result = shapeRoot(root, onIssue)
    if (result.kind === 'rejected') return result
    const verdict = guardRoot(result.root)
    if (verdict.kind === 'rejected') return verdict
    return { kind: 'ok' as const, root: withoutForbiddenKeys(result.root) }
    // The report is the business of whoever gave the handler; the tree shape does not depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])
  /*
   * TREE IN THE WIDTH CLASS (9.18.0): effective props, the style base with `styleOn` layers,
   * without `propsOn` / `styleOn`; the screen is then drawn as an ordinary document. Memoized by
   * node identity, so a data change does not resolve the tree again; on `compact` it is the node
   * itself. The class is one of three words only: anything else (the host may pass anything) is
   * `compact`.
   */
  const klass = widthClassWord(widthClass)
  const shapedRoot = shaped.kind === 'ok' ? shaped.root : undefined
  const classRoot = useMemo(() => (shapedRoot === undefined ? undefined : withoutRootShowOn(nodeInWidthClass(shapedRoot, klass))), [shapedRoot, klass])
  // Collections are laid UNDER the data: a condition on a collection path sees the list itself.
  // The record the screen was opened with goes OVER the data: the details screen is about the row that was clicked.
  const scope = useMemo(
    // Layers by descending strength: screen record -> session -> host data (`DATA_LAYER_ORDER`).
    () => {
      const base = withCollections(data, collections)
      return withScreenRecord(overlayRecord(base, isRecord(session) ? session : undefined) ?? base, isRecord(record) ? record : undefined)
    },
    [data, collections, record, session],
  )
  const recordPlace = useMemo<RecordPlace>(() => (isRecord(record) ? { record, insideListItem: false, links } : NO_RECORD), [record, links])
  /*
   * THE LIST BUDGET OF THE SCREEN (9.28.0, `x-listBudget`): at most 2500 instances of list templates, nested ones included,
   * in document order depth first. Planned once over the tree of the screen; each list asks the plan how many it may draw.
   */
  const budget = useListBudget(classRoot, scope, collections, screenId, onIssue)
  const shown = shownByParent ?? resolveDocumentLocale(localization, locale)
  // One instant per screen: two labels of the same screen cannot count days from different "nows".
  const moment = readerNow(now)

  if (shaped.kind === 'rejected') {
    if (shaped.reason === 'not_a_node') return null
    return <div role="alert">Screen “{screenId}” was not rendered: {shaped.reason}.</div>
  }
  const safeRoot = classRoot ?? shaped.root

  // Everything that leaves the document for the HOST leaves here: an action with string parameters, a write to an allowed path.
  const dispatch: ActionHandler = (action, source, insideListItem, extras) => {
    const carried = safeRecordOf(source.record, onIssue, `node “${source.nodeId}”: record`)
    const safeSource: ActionSource = carried === undefined ? { nodeId: source.nodeId, screenId: source.screenId } : { nodeId: source.nodeId, screenId: source.screenId, record: carried }
    return outcomeOf(onAction(action, safeSource, insideListItem === true, extras))
  }
  const { write, writeInput } = hostWriters({ onWrite, writablePaths, onSessionWrite, onWriteRefused, onIssue })
  // Form of the SCREEN (9.14.0): the root of this `screens[]` entry and the data layers it was opened with. Only a button that asks will compute it.
  const formFilled = (): boolean => isFormFilled(safeRoot, scope, klass)
  const safeCollections = isRecord(collections) ? collections : NO_COLLECTIONS
  const safeAssets = isRecord(assets) ? assets : NO_ASSETS

  return (
    <ThemeContext.Provider value={theme}>
      <CollectionsContext.Provider value={safeCollections}>
        <PlaceContext.Provider value={{ screenId, nodeId: safeRoot.id, localization, shown, timeZone, now: moment }}>
          <IssueContext.Provider value={onIssue}>
          <DirectionContext.Provider value={direction ?? directionOf(shown.directionLocale)}>
            <ActionContext.Provider value={dispatch}>
              <WriteContext.Provider value={write}>
               <InputWriteContext.Provider value={writeInput}>
                <FormContext.Provider value={formFilled}>
                <AutofillContext.Provider value={autofill}>
                <AssetContext.Provider value={safeAssets}>
                  <ImageContext.Provider value={images}>
                    <LabelsContext.Provider value={labels}>
                      <DataContext.Provider value={scope}>
                        <ListBudgetContext.Provider value={budget}>
                        <RecordContext.Provider value={recordPlace}>
                          {/* Inheritance starts at the SCREEN root: a modal does not take the color of the screen under it. */}
                          <TextContext.Provider value={ROOT_TEXT_STYLE}>
                            <AnatomyContext.Provider value={anatomy}>
                              <WidthClassContext.Provider value={klass}>
                                <CountdownClock root={safeRoot} pinned={nowPinned ?? isPinnedNow(now)}>
                                  <NodeView node={safeRoot} />
                                </CountdownClock>
                              </WidthClassContext.Provider>
                            </AnatomyContext.Provider>
                          </TextContext.Provider>
                        </RecordContext.Provider>
                        </ListBudgetContext.Provider>
                      </DataContext.Provider>
                    </LabelsContext.Provider>
                  </ImageContext.Provider>
                </AssetContext.Provider>
                </AutofillContext.Provider>
                </FormContext.Provider>
               </InputWriteContext.Provider>
              </WriteContext.Provider>
            </ActionContext.Provider>
          </DirectionContext.Provider>
          </IssueContext.Provider>
        </PlaceContext.Provider>
      </CollectionsContext.Provider>
    </ThemeContext.Provider>
  )
})

const NO_COLLECTIONS: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {}
