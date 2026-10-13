/** README example: input fields: what gets written, who validates, how to turn off browser suggestions. */
import { useState } from 'react'

import { HotlayoutScreen } from '@hotlayout/react'
import type { DataScope, UiDocument } from '@hotlayout/react'

// #region forms
/** The paths the profile screens may write to — from your project's data dictionary. */
const FORM_PATHS = ['form.fullName', 'form.email', 'form.phone', 'form.comment', 'form.agreed', 'settings.notifications', 'settings.marketing'] as const

export function ProfileForm({ layout, initial, trusted }: { layout: UiDocument; initial: DataScope; trusted: boolean }) {
  const [data, setData] = useState<DataScope>(initial)
  // The document has no validation rules: you say what is wrong, as a string under the path the field's `error` is bound to.
  const phone = data['form.phone']
  const phoneError = typeof phone === 'string' && phone !== '' && !/^\+?[\d\s()-]{7,}$/.test(phone) ? 'Enter a phone number' : ''
  return (
    <HotlayoutScreen
      document={layout}
      data={{ ...data, 'form.phoneError': phoneError }}
      writablePaths={FORM_PATHS}
      // A document from a source you do not control: no autofill hints at all.
      autofill={trusted}
      onWrite={(path, value) => {
        // Called on EVERY keystroke with a string, and on every press of a switch or a checkbox with a boolean.
        // The value is user input — check it again on your backend. Throttle what you send over the network yourself.
        setData((current) => ({ ...current, [path]: value }))
      }}
    />
  )
}
// #endregion

// #region survey
/** A survey: required fields, a button that waits for them, a number field. The renderer decides; you only receive and check. */
const SURVEY_PATHS = ['survey.goal', 'survey.name', 'survey.age', 'survey.comment', 'survey.agreed'] as const

export function Survey({ layout, send }: { layout: UiDocument; send: (answers: Readonly<Record<string, string | boolean | number>>) => Promise<void> }) {
  const [answers, setAnswers] = useState<Readonly<Record<string, string | boolean | number>>>({})
  return (
    <HotlayoutScreen
      document={layout}
      writablePaths={SURVEY_PATHS}
      onWrite={(path, value) => {
        // A number field writes a NUMBER, or `""` when the text is not a number or was cleared ("there is no number") — never `null`.
        setAnswers((current) => ({ ...current, [path]: value }))
      }}
      onAction={(action) => {
        // A button with `requiresFilled` / `disabledIf` never reaches here while it is disabled — but a disabled button is a convenience,
        // not protection: check the answers again before you accept them.
        if (action.type === 'survey.send' && typeof answers['survey.age'] === 'number') void send(answers)
      }}
    />
  )
}
// #endregion
