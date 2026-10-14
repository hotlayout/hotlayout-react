/** What the input widgets share: the path of the value, the disabled state and look, the required mark. */
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { isDisabledBy } from '../conditions'
import { FORM_RULES, REQUIRED_MARK } from '../form-rules'
import { INPUTS_LAYOUT } from '../inputs-layout'
import { inputPathOf } from '../input-rules'
import { productVar } from '../theme'
import { IssueContext, useData } from './contexts'
import { screenPart } from './screen-part'

/**
 * An input field: its value is a data PATH of the data contract. It is read through the layers
 * (record, session, host scope, data) and WRITTEN to the reader session and to the host at the same
 * moment (`InputWriteContext`). Without a path (the document was not built by our builder) the field
 * works locally and writes nowhere; a message goes to `onReport`.
 */
export function useInputPath(value: unknown, nodeId: string): string | undefined {
  const report = useContext(IssueContext)
  const path = inputPathOf(value)
  if (path === undefined) report({ where: `node “${nodeId}”: value`, reason: 'an input without a readable binding path works locally and writes nothing' })
  return path
}

/** A field is disabled when its `disabledIf` holds (the same layers and evaluator as `visibleIf`). */
export function useInputDisabled(condition: unknown): boolean {
  const scope = useData()
  return condition !== undefined && isDisabledBy(condition, scope)
}

/** The shared look of a disabled widget: an opacity from the data, on the WHOLE widget. */
export function disabledLook(disabled: boolean): CSSProperties {
  return disabled ? { opacity: INPUTS_LAYOUT.rules.disabled.look.opacity } : {}
}

/**
 * The "required" mark (`form.required.mark`): an asterisk right after the label text, on the same
 * line, an `xs` gap away, in the `danger` colour and the label font. It is hidden from screen
 * readers and not part of the accessible name; the field never shows a "fill this in" text
 * (`requiredMessage`).
 */
export const RequiredMark = screenPart(function RequiredMark(): ReactNode {
  const mark = FORM_RULES.required.mark
  return (
    <span aria-hidden="true" data-hl-required="" style={{ marginInlineStart: productVar('spacing', mark.gap), color: productVar('color', mark.color) }}>
      {REQUIRED_MARK}
    </span>
  )
})
