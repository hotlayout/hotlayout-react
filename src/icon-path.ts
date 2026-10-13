/**
 * An icon from data (schema 9.19.0): the field `iconPath` beside the name of an icon, in `Icon`, `Button`, `Badge`
 * and `IconButton`. The drawing depends on the record ("credited / spent", "on the way / delivered"); the node
 * carries a PATH of the data, and under it lies the NAME of an icon of the contract icon set.
 *
 * The name of the document stays beside the path: it is drawn when the data has no value (absent, `null`, an empty
 * string) and by a reader older than 9.19, which does not know the field. The path of a node WITHOUT an icon in the
 * document is not read at all: a drawing appearing from data would move the label, and "no icon" stays one state.
 *
 * TRUST BOUNDARY. From data comes only a NAME, which the reader looks up in its OWN copy of the set and nowhere else.
 * A string that is not in the set is an empty box of the same size (the gap stays), a value that is not a string is
 * the same, and neither is turned into text. An address, a drawing or markup never comes from data. The mirroring in
 * a right-to-left screen is decided by the RESOLVED name; the size, the colour and the place are those of the icon of
 * the document. Rules: the artifact block `x-iconFromData`, mirrored below whole.
 */

/** The key of the field: one in every widget that carries it. */
export const ICON_PATH_KEY = 'iconPath'

/**
 * The name an icon is drawn by. `icon` is the name of the document (a button or a badge may have none), `path` is the
 * value of the field, `read` reads a path with the layers of the data of the node.
 */
export function resolveIconName(icon: unknown, path: unknown, read: (path: string) => unknown): unknown {
  if (icon === undefined || typeof path !== 'string' || path === '') return icon
  const value = read(path)
  return value === undefined || value === null || value === '' ? icon : value
}

/** The block `x-iconFromData` of the artifact, whole (a test compares it). */
export const ICON_FROM_DATA_RULES = {
  props: {
    path: 'iconPath',
    name: {
      Icon: 'name',
      Button: 'icon',
      Badge: 'icon',
      IconButton: 'icon',
    },
  },
  pathType: 'string',
  value: 'a-name-of-the-contract-icon-set',
  layers: 'x-dataScope.layers',
  absentValue: 'the-icon-of-the-document',
  nullValue: 'the-icon-of-the-document',
  emptyString: 'the-icon-of-the-document',
  nameNotInSet: 'x-compatibility.policy.unknownIcon',
  valueNotAString: 'x-compatibility.policy.unreadableIconValue',
  withoutIconInDocument: 'no-icon-the-path-is-not-read',
  mirroring: 'by-the-resolved-name',
  size: 'unchanged-named-by-the-place',
  neverFromData: ['an-address', 'a-drawing', 'markup'],
  olderReader: 'ignores-the-field-and-draws-the-icon-of-the-document',
  cases: 'contract/fixtures/icon-text/icon-text-cases.json',
} as const
