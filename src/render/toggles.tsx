/** The toggles: `Switch` and `Checkbox`. */
import { useContext, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { valueAt } from '../data'
import { isRequired } from '../form-rules'
import { INITIAL_TOGGLE, pressToggle, readInputFlag, shownToggle, syncToggle } from '../input-rules'
import { INPUTS_LAYOUT, switchThumbOffsetOf } from '../inputs-layout'
import type { ToggleState } from '../input-rules'
import { typographyCss } from '../resolve'
import { InputWriteContext } from '../runtime'
import { cssPx } from '../sanitize'
import { typographyToCss } from '../style'
import { PRESSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import { useData, useTheme } from './contexts'
import { Glyph } from './icon'
import { RequiredMark, disabledLook, useInputDisabled, useInputPath } from './input-shared'
import { asCss } from './prop-tokens'
import { useText } from './use-text'
import type { NodeMark, WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/**
 * The state of a switch and a checkbox: what to show and what to do on a press. When the layer
 * values change, what the person set no longer holds (`syncToggle`).
 */
function useToggle(value: unknown, disabledIf: unknown, nodeId: string): { readonly on: boolean; readonly disabled: boolean; readonly press: () => void } {
  const scope = useData()
  const write = useContext(InputWriteContext)
  const path = useInputPath(value, nodeId)
  const bound = readInputFlag(path === undefined ? undefined : valueAt(scope, path))
  const disabled = useInputDisabled(disabledIf)
  const [held, setHeld] = useState<ToggleState>(INITIAL_TOGGLE)
  const state = syncToggle(held, bound)
  if (state !== held) setHeld(state)
  const on = shownToggle(state, bound)
  const press = (): void => {
    const step = pressToggle(state, bound, { disabled, hasPath: path !== undefined })
    setHeld(step.state)
    if (step.write !== undefined && path !== undefined) write?.(path, step.write)
  }
  return { on, disabled, press }
}

/** A control row: a real button with a role and a state, named by its label; the WHOLE row strip is pressable. */
const ToggleRow = screenPart(function ToggleRow({
  role,
  required,
  view,
  css,
  mark,
  align,
  gap,
  children,
}: {
  readonly role: 'switch' | 'checkbox'
  readonly required?: boolean
  readonly view: { readonly on: boolean; readonly disabled: boolean; readonly press: () => void }
  readonly css: CSSProperties
  readonly mark: NodeMark
  readonly align: 'center' | 'flex-start'
  readonly gap: string
  readonly children: ReactNode
}): ReactNode {
  const theme = useTheme()
  return (
    <div {...mark} style={{ display: 'flex', minInlineSize: 0, ...css }}>
      <button
        type="button"
        role={role}
        aria-checked={view.on}
        aria-required={required === true ? true : undefined}
        disabled={view.disabled}
        className={PRESSABLE_CLASS}
        style={{
          display: 'flex',
          alignItems: align,
          gap: productVar('spacing', gap),
          inlineSize: '100%',
          minInlineSize: 0,
          textAlign: 'start',
          color: productVar('color', INPUTS_LAYOUT.switch.label.color),
          ...asCss(typographyToCss(typographyCss(INPUTS_LAYOUT.switch.label.typography, theme))),
          ...disabledLook(view.disabled),
        }}
        onClick={view.press}
        onKeyDown={(event) => {
          // A checkbox is toggled by Space only: Enter on a button would be a click.
          if (role === 'checkbox' && event.key === 'Enter') event.preventDefault()
        }}
      >
        {children}
      </button>
    </div>
  )
})

const TOGGLE_LABEL: CSSProperties = { flex: '1 1 auto', minInlineSize: 0, overflowWrap: 'anywhere' }

export const SwitchView = screenPart(function SwitchView({ node, props, css, mark }: WidgetProps): ReactNode {
  const layout = INPUTS_LAYOUT.switch
  const label = useText(props.label, 'label')
  const view = useToggle(props.value, props.disabledIf, node.id)
  return (
    <ToggleRow role="switch" view={view} css={css} mark={mark} align="center" gap={layout.gap}>
      <span style={TOGGLE_LABEL}>{label}</span>
      {/* The track is at the END of the row (logically); the thumb is at the start when off and at the end when on. */}
      <span
        aria-hidden="true"
        style={{
          flex: 'none',
          position: 'relative',
          display: 'block',
          inlineSize: cssPx(layout.track.width),
          blockSize: cssPx(layout.track.height),
          borderRadius: productVar('radius', layout.track.radius),
          backgroundColor: productVar('color', view.on ? layout.color.on.track : layout.color.off.track),
        }}
      >
        <span
          style={{
            position: 'absolute',
            insetBlockStart: cssPx((layout.track.height - layout.thumb.size) / 2),
            insetInlineStart: cssPx(switchThumbOffsetOf(view.on)),
            inlineSize: cssPx(layout.thumb.size),
            blockSize: cssPx(layout.thumb.size),
            borderRadius: '50%',
            backgroundColor: productVar('color', view.on ? layout.color.on.thumb : layout.color.off.thumb),
          }}
        />
      </span>
    </ToggleRow>
  )
})

export const CheckboxView = screenPart(function CheckboxView({ node, props, css, mark }: WidgetProps): ReactNode {
  const layout = INPUTS_LAYOUT.checkbox
  const label = useText(props.label, 'label')
  const view = useToggle(props.value, props.disabledIf, node.id)
  const colors = view.on ? layout.color.on : layout.color.off
  return (
    <ToggleRow role="checkbox" required={isRequired(node)} view={view} css={css} mark={mark} align="flex-start" gap={layout.gap}>
      {/* The square is at the START of the row, centred on the FIRST line of the label. */}
      <span
        aria-hidden="true"
        style={{
          flex: 'none',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          inlineSize: cssPx(layout.box.size),
          blockSize: cssPx(layout.box.size),
          marginBlockStart: `max(0px, calc((1lh - ${cssPx(layout.box.size)}) / 2))`,
          border: `${cssPx(layout.box.border.width)} solid ${productVar('color', colors.border)}`,
          borderRadius: cssPx(layout.box.radius),
          backgroundColor: view.on ? productVar('color', layout.color.on.background) : 'transparent',
          color: productVar('color', layout.color.on.mark),
          // The tick is the `check` glyph of the icon set with side `mark.size`; it is not mirrored in RTL (it is not an arrow).
          fontSize: cssPx(layout.mark.size),
          lineHeight: 1,
        }}
      >
        {view.on ? <Glyph name={layout.mark.icon} /> : null}
      </span>
      <span style={TOGGLE_LABEL}>
        {label}
        {isRequired(node) ? <RequiredMark /> : null}
      </span>
    </ToggleRow>
  )
})
