/** What leaves the document for the host: a write path the host allows and a record safe to hand over. */
import type { DataScope } from '../data'
import type { ScreenViewProps } from '../render'
import { hasForbiddenSegment, isRecord, safeDataPath } from '../sanitize'
import type { InputWriteHandler, WriteHandler } from '../runtime'
import type { IssueSink } from '../shape'

/**
 * A write PATH that may be handed to the host, or `undefined`.
 *
 * The DOCUMENT names the path, and a host often writes "by path" into nested state
 * (`set(state, path, value)`): `__proto__.isAdmin` there is pollution of `Object.prototype` in the
 * host app. So the segments `__proto__`, `constructor` and `prototype` are always refused; beyond
 * that comes the host list (`writablePaths`), and without it the path form of the data contract.
 */
export function writablePathOf(path: unknown, writablePaths: ScreenViewProps['writablePaths']): string | undefined {
  if (typeof path !== 'string' || path === '' || hasForbiddenSegment(path)) return undefined
  if (writablePaths === undefined) return safeDataPath(path)
  if (typeof writablePaths === 'function') {
    try {
      return writablePaths(path) ? path : undefined
    } catch {
      return undefined
    }
  }
  return Array.isArray(writablePaths) && writablePaths.includes(path) ? path : undefined
}

/**
 * A RECORD THAT MAY BE HANDED TO THE HOST (`source.record`) and carried to the next screen: a new
 * flat map holding only the record's OWN keys that have the form of a data path (`sanitize.ts`,
 * `safeDataPath`), with no `__proto__`, `constructor` or `prototype` in the segments. The values are
 * the same ones the host gave in `collections`: the document does not name them and cannot replace
 * them. The map is frozen, so a host handler cannot change the record the next screen opens with.
 *
 * The entity prefix is named by the DOCUMENT (`Repeater.item`), so a key such as `__proto__.id` can
 * get this far, and it stops here.
 */
export function safeRecordOf(record: unknown, report: IssueSink, where: string): DataScope | undefined {
  if (!isRecord(record)) return undefined
  const safe: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const key of Object.keys(record)) {
    if (safeDataPath(key) === undefined) dropped.push(key.slice(0, 40))
    else safe[key] = record[key]
  }
  if (dropped.length > 0) report({ where, reason: `record fields whose names are not data paths were dropped: ${dropped.slice(0, 5).join(', ')}` })
  return Object.freeze(safe)
}

/** The write handlers of one screen: a write of a choice group (`write`) and a write of an input field (`writeInput`), both through the paths the host allows. */
export function hostWriters({
  onWrite,
  writablePaths,
  onSessionWrite,
  onWriteRefused,
  onIssue,
}: Pick<ScreenViewProps, 'onWrite' | 'writablePaths' | 'onSessionWrite' | 'onWriteRefused'> & { readonly onIssue: IssueSink }): { readonly write: WriteHandler | undefined; readonly writeInput: InputWriteHandler } {
  const write: WriteHandler | undefined =
    onWrite === undefined
      ? undefined
      : (path, value) => {
          const allowed = writablePathOf(path, writablePaths)
          if (allowed === undefined) {
            onIssue({ where: 'onWrite path', reason: `the document asked to write to “${path.slice(0, 80)}”, which is not a writable path; nothing was written` })
            return
          }
          onWrite(allowed, value)
        }
  /*
   * The write of an INPUT FIELD goes to the reader session (so dependent conditions and texts of
   * this screen update at once) and to the host at the same moment, before any action. The path is
   * named by the document, so the same protection applies as for a choice group.
   */
  const writeInput: InputWriteHandler = (path, value) => {
    const allowed = writablePathOf(path, writablePaths)
    if (allowed === undefined) {
      ;(onWriteRefused ?? onIssue)({ where: 'onWrite path', reason: `the document asked to write to “${path.slice(0, 80)}”, which is not a writable path; nothing was written` })
      return
    }
    onSessionWrite?.(allowed, value)
    onWrite?.(allowed, value)
  }
  return { write, writeInput }
}
