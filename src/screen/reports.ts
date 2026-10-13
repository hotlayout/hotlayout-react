/** Reports to the host: the text of a report for the console and the box that hands each report over once. */
import type { HotlayoutReport } from '../HotlayoutScreen'

export function describe(report: HotlayoutReport): string {
  switch (report.kind) {
    case 'incompatible-document':
      return report.relation === 'document-older'
        ? `document ${report.documentVersion} was not rendered: ${report.reason}. The layout is older than this reader (${report.readerVersion}); republish it from the builder`
        : `document ${report.documentVersion} was not rendered: ${report.reason}`
    case 'newer-minor-document':
      return `document ${report.documentVersion} is newer than this reader; unknown widgets and tokens are skipped`
    case 'theme-fallback':
      return `the built-in theme is used: ${report.reason}`
    case 'unknown-theme-id':
      return `theme “${report.themeId}” is not in the set; “${report.used}” is used`
    case 'unknown-entry':
      return `entry point “${report.entry}” is not in the document; the initial screen is shown`
    case 'no-screen':
      return report.reason
    case 'invalid-theme-values':
      return `theme values that do not have the shape of the theme schema were ignored: ${report.paths.join(', ')}`
    case 'ignored-input':
      return `${report.where}: ${report.reason}`
    case 'render-error':
      return `screen “${report.screenId}” threw while rendering and was replaced by a notice: ${report.message}`
  }
}

/** How many distinct reports about ignored input the reader emits over a component's life: a corrupt tree must not flood the host's log. */
const MAX_REPORTS = 50

/**
 * The report box of one component: what the host has already been told and what waits for an
 * effect. A class rather than a `ref`: the box is filled DURING the render of descendants (tree
 * shape, image policy), and its only side effect is adding an entry to a set.
 */
export class ReportBox {
  private readonly seen = new Set<string>()
  private pending: HotlayoutReport[] = []

  /** Returns `true` when the report is new and waits to be delivered. */
  note(report: HotlayoutReport): boolean {
    const key = JSON.stringify(report)
    if (this.seen.has(key) || this.seen.size >= MAX_REPORTS) return false
    this.seen.add(key)
    this.pending.push(report)
    return true
  }

  drain(): readonly HotlayoutReport[] {
    const pending = this.pending
    this.pending = []
    return pending
  }
}
