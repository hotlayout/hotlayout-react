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

export { HOTLAYOUT_CSS } from './styles'

export type { LocalizationSection, ScreenEntry, UiDocument, UiNode } from './types'
export type { WidthClass } from './width-class'
