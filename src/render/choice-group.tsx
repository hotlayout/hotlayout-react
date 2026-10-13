/** The choice group (`ChoiceGroup`): which option is selected and where the choice is written. */
import { useContext, useState } from 'react'
import type { ReactNode } from 'react'

import { readBindable } from '../data'
import { choiceWriteOf, isRequired } from '../form-rules'
import { ChoiceContext, InputWriteContext } from '../runtime'
import type { ChoiceScope } from '../runtime'
import { useData } from './contexts'
import { COLUMN } from './flex-words'
import { useSpacing } from './prop-tokens'
import { Children } from './siblings'
import { asBindable } from './use-text'
import type { WidgetProps } from './widget-props'

/**
 * The choice group is the only node of the contract with state of ITS OWN.
 *
 * `value` says which option is selected when the screen is shown; after that the user switches it
 * and the document never learns of it. The state lives in the group itself and not under its `id`:
 * two groups with the same `id` on different screens would otherwise share one mark.
 *
 * A BOUND `value` is also WRITTEN: the document named a path, so the selected name goes along it
 * into the reader session and to the host (`onWrite`), exactly like input in a field (schema
 * 9.14.0, `choiceWrite`). Dependent conditions and a button with `requiresFilled` see the choice at
 * once, without a reply from the host. A literal `value` has no address, so the choice stays local.
 *
 * The document outranks the finger: if `value` changed (new data under the binding), the previous
 * choice is no longer about it and is reset.
 */
export function ChoiceGroupView({ node, props, css, mark }: WidgetProps): ReactNode {
  const gap = useSpacing(props.gap, 'none')
  const scope = useData()
  const write = useContext(InputWriteContext)
  const bindable = asBindable(props.value)
  // Deliberately not translated: this is the NAME of an option, compared with `optionValue`, not text for a person.
  const documentValue = readBindable(bindable, scope)
  const [picked, setPicked] = useState<{ readonly from: string; readonly value: string } | undefined>(undefined)
  // An empty string means "nothing selected", not an option with an empty name: that is what a binding without data looks like.
  const fromDocument = documentValue === '' ? undefined : documentValue
  const selected = picked?.from === documentValue ? picked.value : fromDocument

  const choice: ChoiceScope = {
    selected,
    select: (optionValue) => {
      setPicked({ from: documentValue, value: optionValue })
      // Like input in a field (`choiceWrite`): to the reader session and the host at the same moment; an option already shown is not written again.
      const written = choiceWriteOf(props.value, optionValue, selected)
      if (written !== undefined) write?.(written.path, written.value)
    },
  }

  return (
    <div {...mark} role="radiogroup" aria-required={isRequired(node) ? true : undefined} style={{ ...COLUMN, gap, ...css }}>
      <ChoiceContext.Provider value={choice}>
        <Children node={node} />
      </ChoiceContext.Provider>
    </div>
  )
}
