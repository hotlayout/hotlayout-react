/**
 * @hotlayout/react — renders HotLayout layout documents in React.
 *
 * The public surface is deliberately small: one component, the version rule,
 * two optional loaders and the types of what goes in and out. Everything else
 * in this package is internal and may change between minor versions.
 */
export { HotlayoutScreen } from './HotlayoutScreen'
export type { Collections, HotlayoutReport, HotlayoutScreenProps, NavigationEvent, ScreenInfo, ScreenShown } from './HotlayoutScreen'

export type { ActionParamProblem, ActionSource, HotlayoutAction, InvalidActionParam, StandardAction, TrackEvent } from './actions'
export type { HapticWord } from './haptic'
export { ACTION_CATALOG, paramFormProblem } from './action-catalog'
export type { CatalogAction, CatalogParam } from './action-catalog'
export { openInNewTab, runStandardAction } from './standard-actions'
export type { StandardActionHandlers } from './standard-actions'
export type { DataScope } from './data'
export type { TextDirection } from './direction'
export type { ImageUrlContext, ResolveImageUrl } from './images'
export type { LocaleResolution } from './locale'
export { resolveLocale } from './locale'
export type { ScreenLabels } from './runtime'

export { checkVersion as checkDocumentVersion, READER_ICON_SET_VERSION, READER_SCHEMA_VERSION, READER_THEME_VERSION } from './version'
export type { IncompatibleRelation, VersionVerdict } from './version'

export { resolveTheme } from './theme-resolve'
export type { ResolvedTheme, ThemeReport } from './theme-resolve'
export { BUILT_IN_THEME_CONTRACT } from './built-in-theme'
export type { Theme, ThemeContract } from './theme'

export { HotlayoutLoadError, loadDocument, loadTheme } from './load'
export type { LoadOptions } from './load'

export { HotlayoutPlacement, usePlacement } from './HotlayoutPlacement'
export type { HotlayoutPlacementProps, PlacementStatusEvent, UsePlacementOptions } from './HotlayoutPlacement'
export type { PlacementMapStore, PlacementSettings, PlacementState } from './placement-state'
export { loadPlacementMap, PLACEMENT_REQUEST_DEADLINE_MS } from './placement-load'
export type { LoadPlacementMapOptions } from './placement-load'
export {
  isPlacementName,
  pickPlacementMap,
  placementEvent,
  placementShowing,
  PLACEMENTS_READ_MAX_BYTES,
  PLACEMENTS_READ_MAX_DEPTH,
  readPlacementMap,
  readPlacementMapBytes,
  readPlacementMapText,
  READER_PLACEMENTS_VERSION,
  resolvePlacement,
} from './placements'
export type {
  PlacementDocumentOutcome,
  PlacementEvent,
  PlacementSettled,
  PlacementMapRead,
  PlacementNetworkOutcome,
  PlacementReport,
  PlacementResolution,
  PlacementShowing,
  PlacementSourceDecision,
  PlacementSourceInput,
  PlacementSourceStatus,
  PlacementStatus,
} from './placements'

export { HOTLAYOUT_CSS } from './styles'

export type { LocalizationSection, ScreenEntry, UiDocument, UiNode } from './types'
export type { WidthClass } from './width-class'
