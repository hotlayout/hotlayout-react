/** Reports as effects: what the reader ignored while rendering, and what it decided about the document before rendering. */
import { useEffect, useMemo, useState } from 'react'

import type { HotlayoutReport } from '../HotlayoutScreen'
import type { InputIssue } from '../shape'
import type { ResolvedTheme } from '../theme-resolve'
import type { UiDocument } from '../types'
import { READER_SCHEMA_VERSION } from '../version'
import type { VersionVerdict } from '../version'
import { describe, ReportBox } from './reports'

/** The box of reports of one component and the ways into it. */
export interface ReportChannel {
  readonly issues: ReportBox
  readonly noteIssue: (issue: InputIssue) => void
  readonly refuseWrite: (issue: InputIssue) => void
  readonly deliver: (report: HotlayoutReport) => void
}

export function useReportBox(onReport: ((report: HotlayoutReport) => void) | undefined): ReportChannel {
  /*
   * What the reader ignored while rendering (`ignored-input`, `render-error`): a node of the wrong
   * shape, a "colour" that is not a colour, an image URL the policy refused. Render has no side
   * effects, so findings are collected in a box and an effect hands them to the host after commit,
   * each once.
   */
  const [issues] = useState(() => new ReportBox())
  const noteIssue = (issue: InputIssue): void => {
    issues.note({ kind: 'ignored-input', where: issue.where, reason: issue.reason })
  }
  // A refused field write happens in an event handler, not during rendering, so the report goes to the host at once.
  const refuseWrite = (issue: InputIssue): void => {
    noteIssue(issue)
    for (const report of issues.drain()) deliver(report)
  }
  const deliver = (report: HotlayoutReport): void => {
    if (onReport === undefined) console.warn(`[hotlayout] ${describe(report)}`)
    else onReport(report)
  }
  useEffect(() => {
    for (const report of issues.drain()) deliver(report)
  })
  return { issues, noteIssue, refuseWrite, deliver }
}

export function useStartReports({
  resolved,
  verdict,
  document,
  start,
  entry,
  deliver,
}: {
  readonly resolved: ResolvedTheme
  readonly verdict: VersionVerdict
  readonly document: UiDocument
  readonly start: { readonly screenId: string | undefined; readonly unknownEntry: boolean }
  readonly entry: string | undefined
  readonly deliver: (report: HotlayoutReport) => void
}): void {
  /* Reports go out as an effect: render has no side effects, and a re-render must not repeat a report. */
  const reports = useMemo<readonly HotlayoutReport[]>(() => {
    const list: HotlayoutReport[] = [...resolved.reports]
    if (verdict.kind === 'incompatible') list.push({ kind: 'incompatible-document', documentVersion: document.schemaVersion, readerVersion: READER_SCHEMA_VERSION, reason: verdict.reason, relation: verdict.relation })
    if (verdict.kind === 'newer-minor') list.push({ kind: 'newer-minor-document', documentVersion: verdict.documentVersion })
    if (verdict.kind !== 'incompatible' && start.unknownEntry && entry !== undefined) list.push({ kind: 'unknown-entry', entry })
    if (verdict.kind !== 'incompatible' && start.screenId === undefined) list.push({ kind: 'no-screen', reason: 'the document has no screens' })
    return list
    // The verdict derives from the document version; the object is new every time, so the version is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.reports, document.schemaVersion, start, entry])
  const reportKey = JSON.stringify(reports)
  useEffect(() => {
    for (const report of reports) deliver(report)
    // The key is the content of the reports: the same report is not repeated even when the host passes a new handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey])
}
