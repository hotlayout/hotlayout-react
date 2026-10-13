/**
 * The name an icon is drawn by (schema 9.19.0, `x-iconFromData`): the name of the document, or the name that lies in
 * the data under `iconPath`. The rule is `icon-path.ts`; here it reads the layers of the data of the node and keeps the
 * trust boundary: a value from data that is not a name of the set never reaches the markup.
 */
import { valueAt } from '../data'
import { resolveIconName } from '../icon-path'
import { iconMask } from '../icons'
import { useData } from './contexts'

/**
 * What the drawing is told to draw when the data gave something that is not a name of the set: not a string, so the
 * box stays empty and of the same size (`unknownIcon`, `unreadableIconValue`), the gap beside a text stays, and no
 * attribute carries the string from data.
 */
const NOT_A_NAME = false

/** The name to draw: `icon` of the document unless the data under `path` names another icon of the set. */
export function useIconName(icon: unknown, path: unknown): unknown {
  const scope = useData()
  const resolved = resolveIconName(icon, path, (key) => valueAt(scope, key))
  return resolved === icon || iconMask(resolved) !== undefined ? resolved : NOT_A_NAME
}
