/**
 * The standard-action helper (schema 9.8.0): the only place in the package where a URL from the
 * document can be OPENED, and only if the HOST does it: the host calls the helper from its own
 * `onAction`. The reader itself never calls it.
 *
 * A document arrives over the network, and a URL from it opened without the app's say-so is a
 * phishing page delivered by one published file. Therefore:
 *  - the helper acts only on `action.standard`, a URL that passed the contract's form; an invalid
 *    one (`invalid`) and an app's own action give `false`;
 *  - `openUrl` is executed only if the host supplied `openUrl`;
 *  - `deeplink` only if the link's scheme is in the HOST's `deeplinkSchemes`: the contract's
 *    forbidden-scheme list is the first layer, the host's list is the second, and the second is
 *    mandatory (without it an app link is never executed);
 *  - there is no default `window.open`: the host plugs in a ready implementation
 *    (`openInNewTab`) itself, deliberately.
 *
 * For robustness the helper checks the URL against the form once more: an object assembled by
 * hand in the host does not become "verified" merely by having the right fields.
 *
 * IMPORTS NOTHING FROM REACT: it works on the server.
 */
import { appLinkSchemeOf, paramFormProblem } from './action-catalog'
import type { HotlayoutAction } from './actions'

export interface StandardActionHandlers {
  /** Open an `https` URL. If absent, `openUrl` is not executed. */
  readonly openUrl?: (url: string) => void
  /** App link schemes the host is ready to open (`['myapp', 'tel']`). WITHOUT the list `deeplink` is never executed. */
  readonly deeplinkSchemes?: readonly string[] | ReadonlySet<string>
  /** Open an app link with an allowed scheme. */
  readonly openDeeplink?: (url: string) => void
  /** Close the flow (a screen, a webview, the host's modal). The reader does not touch the stack. */
  readonly close?: () => void
}

/**
 * Executes a standard action if it is verified and the host supplied a handler for it. `true`
 * means executed; `false` means not (an own action, an invalid one, no handler or no permission).
 */
export function runStandardAction(action: HotlayoutAction, handlers: StandardActionHandlers): boolean {
  /*
   * The action is read ONCE into local variables, only strings are trusted (`typeof`), the form
   * is checked over THESE values, and exactly they are passed to the executor. A getter that
   * returns something different the second time, and an object with a `toString` (the pattern
   * sees a string while the handler receives an object), do not get through: a host that
   * assembled an action by hand does not become "verified" by having the right fields.
   */
  const standard = action.standard
  if (standard === undefined || action.invalid !== undefined) return false
  const type: unknown = standard.type

  switch (type) {
    case 'openUrl': {
      const url: unknown = (standard as { readonly url?: unknown }).url
      const open = handlers.openUrl
      if (open === undefined || typeof url !== 'string' || paramFormProblem('httpsUrl', url) !== undefined) return false
      open(url)
      return true
    }
    case 'deeplink': {
      const url: unknown = (standard as { readonly url?: unknown }).url
      const claimed: unknown = (standard as { readonly scheme?: unknown }).scheme
      const open = handlers.openDeeplink
      const allowed = allowedSchemes(handlers.deeplinkSchemes)
      if (open === undefined || allowed === undefined || typeof url !== 'string' || typeof claimed !== 'string') return false
      if (paramFormProblem('appLink', url) !== undefined) return false
      const scheme = appLinkSchemeOf(url)
      if (scheme === undefined || scheme !== claimed || !allowed.has(scheme)) return false
      open(url)
      return true
    }
    case 'close': {
      const close = handlers.close
      if (close === undefined) return false
      close()
      return true
    }
    default:
      return false
  }
}

/** The host's scheme list: only an array or a `Set` of STRINGS (a bare string `'myapp'` would iterate into `m`, `y`, ...); anything else means "no schemes". */
function allowedSchemes(value: unknown): ReadonlySet<string> | undefined {
  if (!Array.isArray(value) && !(value instanceof Set)) return undefined
  const result = new Set<string>()
  for (const entry of value as Iterable<unknown>) if (typeof entry === 'string') result.add(entry)
  return result
}

/** A ready `openUrl` implementation for browsers: a new tab with no access to the host page (`noopener,noreferrer`). The host plugs it in deliberately. */
export function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}
