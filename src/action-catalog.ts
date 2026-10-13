/*
 * Mirror of the contract reference implementation of the action catalog (the package imports
 * nothing from the contract repository): the text below is the same, verbatim. Divergence is caught by the
 * shared case table `action-cases.json` and by the check against the artifact keys `x-actions` /
 * `x-screenShown`. Change it only together with the reference implementation.
 */
/**
 * Action catalog: reference implementation of the rule introduced in schema 9.8.0.
 *
 * An action's `type` stays an OPEN string: an action the reader does not know is handed to the
 * host. The catalog closes nothing; it NAMES the actions whose parameters can be checked:
 *
 *  - `none`, `navigate`, `navigate.back` are executed by the READER (they concern screens of the
 *    same document);
 *  - `openUrl`, `deeplink`, `close` are executed by the HOST.
 *
 * WHY THE READER NEVER OPENS ANYTHING ITSELF. A screen document arrives over the network and is
 * untrusted input. A URL from the document that the reader opened without the host's say-so
 * would be a phishing page inside a bank's browser, delivered by one published file. So a
 * standard action travels to the host the same way as any other, but PARSED AND CHECKED:
 * `handedAction` says whether the URL passed its form, and the package helper that executes
 * standard actions acts only on a checked one.
 *
 * THE URL FORM IS AN EXPRESSION, NOT A PLATFORM PARSER. `new URL()` in a browser and `Uri.parse`
 * in Dart accept different things (`https:\\host`, an embedded tab, `https://bank.com@evil.example`);
 * "whatever the platform accepts" is not a contract rule, the same reason as for
 * `DATE_TIME_PATTERN`. The expressions use ASCII classes only, so `RegExp` in JS and in Dart reads
 * them identically; they travel in the artifact as strings (`x-actions.forms`).
 *
 * ZERO IMPORTS: contract zone; readers mirror the file verbatim. The shared case table is
 * `contract/fixtures/actions/action-cases.json`.
 */

/**
 * Names that are NEVER an action parameter key, a binding key, an event parameter key or an event
 * name. They are the object prototype's own names: a reader building a map would have to
 * remember them every time, and different readers remembered differently. They are not
 * published, and a reader that finds one in a document SKIPS the entry.
 */
export const RESERVED_PARAM_NAMES = ['__proto__', 'constructor', 'prototype'] as const

/** Longest action parameter key. */
export const ACTION_PARAM_KEY_LIMIT = 32

/**
 * Action parameter key and binding key: non-empty, no whitespace, not one of
 * `RESERVED_PARAM_NAMES`. The length limit (`ACTION_PARAM_KEY_LIMIT`) is stated by the schema.
 */
export const ACTION_PARAM_KEY_PATTERN = /^(?!(?:__proto__|constructor|prototype)$)\S+$/

/** Whether a key has the schema's form (pattern and length): what the reader checks when a document arrives unvalidated. */
export function isParamKey(key: string): boolean {
  return key.length <= ACTION_PARAM_KEY_LIMIT && ACTION_PARAM_KEY_PATTERN.test(key)
}

/** Who executes an action. Published in the artifact as `x-actions.executors`. */
export const ACTION_EXECUTORS = ['reader', 'host'] as const
export type ActionExecutor = (typeof ACTION_EXECUTORS)[number]

/**
 * Parameter value forms the catalog can name. The last three (since 9.19.0) belong to write
 * actions: a data dictionary path, a literal value and a type word; their rules live in the
 * artifact key `x-actions.write`, here they are only named.
 */
export const ACTION_PARAM_FORMS = ['screenId', 'httpsUrl', 'appLink', 'dataPath', 'literal', 'valueType'] as const
export type ActionParamForm = (typeof ACTION_PARAM_FORMS)[number]

/**
 * Longest URL. 2048 is the limit browsers, servers and messengers agree on; a longer string is
 * almost certainly not a URL. It is also the limit for the value of ANY action parameter
 * (`ACTION_PARAM_VALUE_MAX`), since a link with campaign tags does not fit in 128 characters.
 */
export const ACTION_URL_MAX = 2048

/** URL characters after the scheme: exactly RFC 3986 (unreserved, reserved and `%`). No space, quotes, `\`, control or non-ASCII characters. */
const URL_CHARS = "A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%"

/**
 * Port: a number 1..65535 without leading zeros, expressed in the pattern (not in code): `:0`,
 * `:00443` and `:65536` fail the form. Without this, `:99999` would throw inside the host's
 * handler.
 */
const PORT = '(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])'

/** Host name label: letters and digits, a hyphen only inside. */
const HOST_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?'

/**
 * `https` URL: lowercase scheme, a host name of TWO or more dot-separated labels, a last label
 * (the zone) of letters only (two or more) or punycode `xn--...`; an optional port 1..65535;
 * then a path, query or fragment.
 *
 * DELIBERATELY ABSENT:
 *  - `@` in the host: `https://bank.com@evil.example` opens evil.example;
 *  - `\`: browsers read it as `/`, the rest of the world does not;
 *  - bracketed IPv6: a list of "internal IPv6 ranges" is not a defence;
 *  - an uppercase scheme (`HTTPS://`): one spelling, so there are not two answers;
 *  - IPv4 ADDRESSES in any notation, and single-label names. The WHATWG URL parser reads a host
 *    made of digits and dots as IPv4 in any numeral system: `https://2130706433/`,
 *    `https://0x7f.1/` and `https://127.1/` all go to 127.0.0.1. A letters-only zone rules this
 *    out structurally, by the expression rather than by a list. The cost is stated: `openUrl`
 *    cannot target an IP (that is an "other action" for the host), and internal NAMES
 *    (`intranet.corp`) look the same to the expression as external ones; where the host may
 *    navigate is the host's decision.
 */
export const HTTPS_URL_PATTERN = new RegExp(
  `^https://(?:${HOST_LABEL}\\.)+(?:[A-Za-z]{2,}|xn--[A-Za-z0-9-]*[A-Za-z0-9])(?::${PORT})?(?:[/?#][${URL_CHARS}]*)?$`,
)

/** App link scheme: a lowercase letter, then lowercase letters, digits, `+`, `.`, `-`; two characters or more (`c:` is a drive, not a scheme). */
export const APP_LINK_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]{1,31}$/

/** A whole app link: scheme, colon and a non-empty remainder made of the same characters as a URL. */
export const APP_LINK_PATTERN = new RegExp(`^([a-z][a-z0-9+.-]{1,31}):[${URL_CHARS}]+$`)

/**
 * Schemes that are NEVER an app link. A closed list, part of the contract data
 * (`x-actions.forms.appLink.forbiddenSchemes`).
 *
 * Three kinds: those that run code or read the device (`javascript`, `data`, `file`, `blob`,
 * `vbscript`, `filesystem`, `content`, `jar`, `resource`), those that address platform internals
 * (`intent`, `android-app`, `about`, `chrome`, `view-source`), and network schemes that either
 * have `openUrl` or have no place here at all (`http`, `https`, `ftp`, `ws`, `wss`).
 *
 * THE LIST IS NOT THE ONLY DEFENCE, and must not pretend to be: there is always one more
 * forbidden scheme. The second layer is the HOST: the standard-action helper opens an app link
 * only for a scheme the host itself named (`deeplinkSchemes`); without that list the link is
 * merely handed over.
 */
export const FORBIDDEN_LINK_SCHEMES = [
  'javascript',
  'data',
  'file',
  'blob',
  'vbscript',
  'filesystem',
  'content',
  'jar',
  'resource',
  'intent',
  'android-app',
  'about',
  'chrome',
  'view-source',
  'http',
  'https',
  'ftp',
  'ws',
  'wss',
] as const

/** Why a parameter value failed its form. Published in the artifact as `x-actions.problems`. */
export const ACTION_PARAM_PROBLEMS = ['missing', 'too-long', 'not-https', 'malformed', 'forbidden-scheme'] as const
export type ActionParamProblem = (typeof ACTION_PARAM_PROBLEMS)[number]

export interface CatalogParam {
  readonly name: string
  readonly required: boolean
  readonly form: ActionParamForm
  /** Whether the value may come from DATA (`paramBindings`). A navigation target may not: the document names the screen. */
  readonly bindable: boolean
}

export interface CatalogAction {
  readonly type: string
  readonly executor: ActionExecutor
  readonly params: readonly CatalogParam[]
}

export const OPEN_URL_ACTION_TYPE = 'openUrl'
export const DEEPLINK_ACTION_TYPE = 'deeplink'
export const CLOSE_ACTION_TYPE = 'close'
/** The URL parameter of `openUrl` and `deeplink`: one name for both actions. */
export const ACTION_URL_PARAM = 'url'

/**
 * The catalog. The order is the order of the list in an editor's action picker.
 *
 * Parameters the catalog does NOT name are not forbidden: they travel to the host as they are
 * (`params`). The catalog names what can be checked, not everything.
 *
 * There is deliberately no `track` here: an analytics event is not an action but a companion of
 * any action (the `track` field next to `type`). A button that only sends an event is `none`
 * with a `track` field; a separate type would be a second path to the same thing.
 */
export const ACTION_CATALOG: readonly CatalogAction[] = [
  { type: 'none', executor: 'reader', params: [] },
  { type: 'navigate', executor: 'reader', params: [{ name: 'screenId', required: true, form: 'screenId', bindable: false }] },
  { type: 'navigate.back', executor: 'reader', params: [] },
  { type: 'navigate.section', executor: 'reader', params: [{ name: 'screenId', required: true, form: 'screenId', bindable: false }] },
  { type: OPEN_URL_ACTION_TYPE, executor: 'host', params: [{ name: ACTION_URL_PARAM, required: true, form: 'httpsUrl', bindable: true }] },
  { type: DEEPLINK_ACTION_TYPE, executor: 'host', params: [{ name: ACTION_URL_PARAM, required: true, form: 'appLink', bindable: true }] },
  { type: CLOSE_ACTION_TYPE, executor: 'host', params: [] },
  // Since 9.19.0: write a value to a data dictionary path, through the same mechanism as an input field (`x-actions.write`).
  {
    type: 'setValue',
    executor: 'reader',
    params: [
      { name: 'path', required: true, form: 'dataPath', bindable: false },
      { name: 'value', required: false, form: 'literal', bindable: false },
      { name: 'valueType', required: false, form: 'valueType', bindable: false },
    ],
  },
  { type: 'toggleValue', executor: 'reader', params: [{ name: 'path', required: true, form: 'dataPath', bindable: false }] },
]

/** The catalog entry for a type; `undefined` means the action is not named (an app's own action). */
export function catalogActionOf(type: string): CatalogAction | undefined {
  return ACTION_CATALOG.find((entry) => entry.type === type)
}

/** The app link scheme, if the string has that form. */
export function appLinkSchemeOf(value: string): string | undefined {
  return APP_LINK_PATTERN.exec(value)?.[1]
}

/**
 * A value checked against a form. `undefined` means it passed.
 *
 * The order of checks is part of the rule (the case table observes it): missing, then too long,
 * then form. `screenId` is not judged here: whether such a screen exists is known only to
 * whoever holds the document. Write-action parameter forms are not judged here either.
 */
export function paramFormProblem(form: ActionParamForm, value: string | undefined): ActionParamProblem | undefined {
  if (value === undefined || value === '') return 'missing'
  // A navigation target is judged by whoever holds the document; write parameters follow the `x-actions.write` rules.
  if (form !== 'httpsUrl' && form !== 'appLink') return undefined
  if (value.length > ACTION_URL_MAX) return 'too-long'
  if (form === 'httpsUrl') {
    if (!value.startsWith('https://')) return 'not-https'
    return HTTPS_URL_PATTERN.test(value) ? undefined : 'malformed'
  }
  const scheme = appLinkSchemeOf(value)
  if (scheme === undefined) return 'malformed'
  return (FORBIDDEN_LINK_SCHEMES as readonly string[]).includes(scheme) ? 'forbidden-scheme' : undefined
}

/* ───────────────────────────── parameter from data ───────────────────────────── */

/** An action as it lies in the document: exactly the fields the catalog reads. */
export interface ActionShape {
  readonly type: string
  readonly params?: Readonly<Record<string, string>> | undefined
  readonly paramBindings?: Readonly<Record<string, string>> | undefined
  readonly carryRecord?: true | undefined
  readonly track?: TrackShape | undefined
}

export interface TrackShape {
  readonly event: string
  readonly params?: Readonly<Record<string, string>> | undefined
}

/**
 * Whether what the data gave for a parameter path counts as a value: a NON-EMPTY STRING no longer
 * than the limit. Anything else means "no value", and the literal from `params` applies.
 *
 * WHY ONLY A STRING. A number would have to be converted to text, and `String(3.0)` is `3` in
 * JS but `3.0` in Dart: two readers would hand the host two different parameters. An empty string
 * means "no value" for the same reason as in `emptyBoundString`.
 */
export function boundParamValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' && value.length <= ACTION_URL_MAX ? value : undefined
}

/**
 * Action parameters after data substitution: `paramBindings` says "take this parameter's value
 * from a data path", and the literal in `params` is the fallback value. `read` resolves the path
 * through the NODE's scope (the layers since 9.2.0: row record, session, host, data), the same
 * way a text binding on that node is read.
 *
 * Only OWN keys count: the author chooses a parameter name, and `constructor` is not a name.
 *
 * DECLARED PROPERTY OF THE FORM (`actionParamComposition: 'none'`): a parameter is either
 * ENTIRELY a value from data or ENTIRELY a literal; there is no concatenation. So a document
 * cannot embed host data in a URL on a foreign domain. A minor version that adds a template to
 * a parameter must also add a host-supplied list of paths allowed for reading (the mirror of
 * `writablePaths`).
 */
export function resolveActionParams(action: ActionShape, read: (path: string) => unknown): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {}
  const entry = catalogActionOf(action.type)
  /*
   * A LITERAL is only a string under a key of the schema's form and no longer than the limit.
   * Anything else is skipped: it is neither converted to text nor truncated.
   */
  const literals = action.params
  if (literals !== undefined) {
    for (const name of Object.keys(literals)) {
      const value: unknown = literals[name]
      if (isParamKey(name) && typeof value === 'string' && value.length <= ACTION_URL_MAX) resolved[name] = value
    }
  }
  const bindings = action.paramBindings
  if (bindings !== undefined) {
    for (const name of Object.keys(bindings)) {
      if (!isParamKey(name)) continue
      /*
       * A catalog parameter with `bindable: false` (a navigation target) is NOT read from data;
       * the literal applies. An "other" action (not in the catalog) and parameters the catalog
       * does not name are read as usual.
       */
      if (entry?.params.some((param) => param.name === name && !param.bindable) === true) continue
      const path = bindings[name]
      const value = typeof path === 'string' ? boundParamValue(read(path)) : undefined
      if (value !== undefined) resolved[name] = value
    }
  }
  return resolved
}

/* ───────────────────────────── what the host receives ───────────────────────────── */

/** A standard action whose parameters PASSED the check: the only kind the package helper executes. */
export type StandardAction =
  | { readonly type: 'openUrl'; readonly url: string }
  | { readonly type: 'deeplink'; readonly url: string; readonly scheme: string }
  | { readonly type: 'close' }

export interface InvalidActionParam {
  readonly param: string
  readonly problem: ActionParamProblem
}

/**
 * An action as the host receives it.
 *
 *  - `type`: as in the document;
 *  - `params`: after data substitution; the key is absent when there are no parameters;
 *  - `standard`: only for a catalog action the host executes, and only when its parameters passed
 *    their form;
 *  - `invalid`: a catalog action with a parameter that failed its form. The host still RECEIVES
 *    it (it may know more than the document), but there is no `standard`, and the helper never
 *    executes such an action.
 *
 * `standard` and `invalid` never occur together; an app's own action has neither.
 */
export interface HandedAction {
  readonly type: string
  readonly params?: Readonly<Record<string, string>>
  readonly standard?: StandardAction
  readonly invalid?: InvalidActionParam
}

function own(params: Readonly<Record<string, string>>, name: string): string | undefined {
  return Object.hasOwn(params, name) ? params[name] : undefined
}

export function handedAction(action: ActionShape, read: (path: string) => unknown): HandedAction {
  const params = resolveActionParams(action, read)
  const base: HandedAction = Object.keys(params).length === 0 ? { type: action.type } : { type: action.type, params }
  const entry = catalogActionOf(action.type)
  if (entry?.executor !== 'host') return base

  for (const param of entry.params) {
    const problem = paramFormProblem(param.form, own(params, param.name))
    if (problem !== undefined && (param.required || problem !== 'missing')) return { ...base, invalid: { param: param.name, problem } }
  }

  if (action.type === OPEN_URL_ACTION_TYPE) return { ...base, standard: { type: 'openUrl', url: own(params, ACTION_URL_PARAM) ?? '' } }
  if (action.type === DEEPLINK_ACTION_TYPE) {
    const url = own(params, ACTION_URL_PARAM) ?? ''
    return { ...base, standard: { type: 'deeplink', url, scheme: appLinkSchemeOf(url) ?? '' } }
  }
  return { ...base, standard: { type: 'close' } }
}

/* ───────────────────────────── analytics event ───────────────────────────── */

/**
 * Event name and event parameter key: a Latin letter, then letters, digits and `_`.
 *
 * This is the NARROWEST form among common analytics systems (Firebase / GA4: up to 40 characters,
 * no spaces or dots). `constructor` and `prototype` fail the form (`__proto__` fails anyway: it
 * does not start with a letter). A host can rename an event toward a wider form, but cannot
 * narrow an arbitrary string without loss, so the narrow form is what the contract states.
 */
export const TRACK_NAME_PATTERN = /^(?!(?:constructor|prototype)$)[A-Za-z][A-Za-z0-9_]*$/
export const TRACK_EVENT_MAX = 40
export const TRACK_PARAM_KEY_MAX = 40
export const TRACK_PARAM_VALUE_MAX = 100
export const TRACK_PARAMS_MAX = 25

/** The analytics event of a press as the host receives it; `undefined` when the action carries none. */
export function trackOf(action: ActionShape): TrackShape | undefined {
  const track = action.track
  if (track === undefined) return undefined
  const params = track.params
  return params === undefined || Object.keys(params).length === 0 ? { event: track.event } : { event: track.event, params: { ...params } }
}

/* ───────────────────────────── document issues ───────────────────────────── */

/**
 * What is wrong with an action IN A DOCUMENT, beyond what the schema's structure says. One
 * source for the validator and for an editor's property panel: the panel shows next to the
 * field exactly what blocks publication.
 *
 * Nothing about data here (whether a path exists in the dictionary is the validator's question to
 * the active dictionary); nothing about screens either (`navigate` is checked by the
 * navigation check).
 */
export type ActionIssue =
  /** A catalog parameter failed its form (a literal; with a binding the literal is only a fallback and may be absent). */
  | { readonly code: 'invalid_action_param'; readonly at: readonly string[]; readonly param: string; readonly problem: ActionParamProblem }
  /** A binding on a parameter that is not read from data (`navigate.screenId`). */
  | { readonly code: 'action_param_not_bindable'; readonly at: readonly string[]; readonly param: string }
  /** `carryRecord` on an action that is not a navigation: there is nowhere to carry the record. */
  | { readonly code: 'carry_record_without_navigation'; readonly at: readonly string[] }

export function actionIssues(action: ActionShape): readonly ActionIssue[] {
  const issues: ActionIssue[] = []
  const entry = catalogActionOf(action.type)
  const params = action.params ?? {}
  const bindings = action.paramBindings ?? {}

  if (entry !== undefined) {
    for (const param of entry.params) {
      const bound = Object.hasOwn(bindings, param.name)
      if (bound && !param.bindable) issues.push({ code: 'action_param_not_bindable', at: ['paramBindings', param.name], param: param.name })
      // The `screenId` form is judged by the navigation check (it needs the set of screens); write parameters by the `x-actions.write` rules.
      if (param.form !== 'httpsUrl' && param.form !== 'appLink') continue
      const literal = own(params, param.name)
      const problem = paramFormProblem(param.form, literal)
      if (problem === undefined) continue
      // With a binding the literal is only a fallback: it may be absent, but if present it must be a valid URL.
      if (problem === 'missing' && (bound || !param.required)) continue
      issues.push({ code: 'invalid_action_param', at: ['params', param.name], param: param.name, problem })
    }
  }

  if (action.carryRecord === true && action.type !== 'navigate') issues.push({ code: 'carry_record_without_navigation', at: ['carryRecord'] })
  return issues
}
