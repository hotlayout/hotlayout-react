/** The mirror of `x-style.layout.inputs` of the schema artifact and the geometry of the three input widgets. */
import { inputLinesOf } from './input-rules'

/** Mirror of the artifact block; equality is checked by a test. Not edited by hand. */
export const INPUTS_LAYOUT = {
  rules: {
    value: {
      is: 'binding-to-a-path-of-the-data-contract',
      pathType: {
        string: [
          'string'
        ],
        boolean: [
          'boolean'
        ]
      },
      read: 'through-the-data-layers-record-session-host-data',
      text: 'string-as-is-anything-else-is-an-empty-field',
      flag: 'on-only-when-true',
      emptyString: 'empty-field-no-fallback-text',
      absent: 'works-locally-writes-nothing'
    },
    write: {
      to: 'session-of-the-reader-and-the-host-at-the-same-moment',
      text: 'on-every-change-made-by-the-person',
      toggle: 'on-every-press',
      throttle: 'none-in-the-reader-the-host-decides',
      sameValue: 'not-written-again',
      composing: 'not-written-until-the-composition-ends',
      cleared: 'writes-the-empty-string',
      beforeAction: 'the-action-pressed-after-the-change-sees-the-written-value',
      untouched: 'a-value-the-platform-filled-before-the-person-touched-the-field-is-neither-kept-nor-written',
      disabled: 'never',
      hostValue: 'string-for-a-text-field-boolean-for-a-toggle'
    },
    shown: {
      focused: 'what-the-person-typed-data-changes-do-not-replace-it',
      unfocused: 'what-the-person-entered-until-the-bound-value-changes-then-the-bound-value'
    },
    disabled: {
      field: 'disabledIf',
      condition: 'same-form-and-rules-as-visibleIf',
      absent: 'enabled',
      look: {
        opacity: 0.5,
        appliesTo: 'the-whole-widget'
      },
      behaviour: 'not-focusable-not-pressable-writes-nothing',
      semantics: 'disabled'
    },
    focus: {
      order: 'document-order-of-the-shown-screen',
      tapOutside: 'removes-focus',
      visible: 'the-focused-field-with-its-helper-is-scrolled-into-the-body-area-above-the-keyboard',
      keyboardInset: {
        flutter: 'reader-reads-the-inset-of-its-own-context-a-host-that-already-resized-gives-zero',
        web: 'left-to-the-browser-the-reader-does-not-listen-to-the-visual-viewport'
      },
      pinned: 'bottomZone.keyboard',
      modal: 'same-rules-the-layer-rises-above-the-keyboard',
      screenChange: 'focus-is-removed'
    },
    keyAction: {
      multiline: 'newline',
      laterField: 'next-moves-focus-to-the-next-shown-enabled-text-field-of-the-screen',
      lastField: 'done-removes-focus',
      action: 'never-performs-an-action'
    },
    autofill: {
      hints: 'only-from-the-keyboard-intent',
      never: [
        'credentials',
        'payment',
        'postal-address',
        'one-time-code'
      ],
      host: 'can-turn-every-hint-off'
    },
    password: 'none-in-9.13'
  },
  textField: {
    direction: 'label-above-box-above-note',
    width: 'stretches',
    gap: 'xs',
    label: {
      typography: 'bodyS',
      color: 'muted',
      lines: 'wraps',
      visible: 'always',
      for: 'the-field'
    },
    box: {
      paddingBlock: 'md',
      paddingInline: 'md',
      radius: 'sm',
      border: {
        width: 1,
        color: 'border'
      },
      background: 'surface',
      typography: 'bodyM',
      color: 'onSurface',
      height: 'border-plus-padding-plus-lines-times-the-line-of-the-typography',
      overflow: {
        singleLine: 'scrolls-inline',
        multiline: 'scrolls-block'
      },
      align: 'start',
      alignBy: 'direction-of-the-screen-not-of-the-content',
      contentDirection: {
        text: 'screen',
        multiline: 'screen',
        email: 'left-to-right',
        number: 'left-to-right',
        phone: 'left-to-right',
        url: 'left-to-right'
      }
    },
    placeholder: {
      color: 'muted',
      shown: 'while-the-field-is-empty'
    },
    note: {
      typography: 'bodyS',
      helperColor: 'muted',
      errorColor: 'danger',
      order: 'error-replaces-helper',
      absent: 'takes-no-space',
      lines: 'wraps'
    },
    states: {
      focused: {
        borderColor: 'primary',
        ring: {
          width: 1,
          color: 'primary',
          inside: true
        },
        geometry: 'unchanged'
      },
      error: {
        borderColor: 'danger',
        strongerThan: 'focused'
      },
      error_is: 'error-text-that-can-be-heard'
    },
    lines: {
      default: 1,
      min: 1,
      max: 8,
      outOfRange: 'one-line'
    },
    maxLength: {
      unit: 'unicode-code-points',
      over: 'input-is-cut-to-the-limit',
      counter: 'none',
      max: 10000
    },
    keyboards: {
      text: {
        web: {
          type: 'text',
          inputmode: 'text',
          autocomplete: 'off',
          autocapitalize: 'sentences',
          spellcheck: true
        },
        flutter: {
          keyboardType: 'text',
          autofillHints: [],
          textCapitalization: 'sentences',
          autocorrect: true
        }
      },
      email: {
        web: {
          type: 'email',
          inputmode: 'email',
          autocomplete: 'email',
          autocapitalize: 'none',
          spellcheck: false
        },
        flutter: {
          keyboardType: 'emailAddress',
          autofillHints: [
            'email'
          ],
          textCapitalization: 'none',
          autocorrect: false
        }
      },
      number: {
        web: {
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          autocapitalize: 'none',
          spellcheck: false
        },
        flutter: {
          keyboardType: 'numberWithOptions(decimal: true)',
          autofillHints: [],
          textCapitalization: 'none',
          autocorrect: false
        }
      },
      phone: {
        web: {
          type: 'tel',
          inputmode: 'tel',
          autocomplete: 'tel',
          autocapitalize: 'none',
          spellcheck: false
        },
        flutter: {
          keyboardType: 'phone',
          autofillHints: [
            'telephoneNumber'
          ],
          textCapitalization: 'none',
          autocorrect: false
        }
      },
      url: {
        web: {
          type: 'url',
          inputmode: 'url',
          autocomplete: 'url',
          autocapitalize: 'none',
          spellcheck: false
        },
        flutter: {
          keyboardType: 'url',
          autofillHints: [
            'url'
          ],
          textCapitalization: 'none',
          autocorrect: false
        }
      }
    },
    defaultKeyboard: 'text',
    unknownKeyboard: 'text',
    multilineKeyboard: 'multiline-the-keyboard-field-is-not-read',
    style: {
      box: 'the-whole-widget-like-every-node',
      color: 'not-read',
      typography: 'not-read'
    },
    semantics: {
      role: 'text-field',
      name: 'label',
      description: 'helper-or-error',
      invalid: 'when-in-the-error-state',
      errorAnnounced: 'politely-when-it-appears',
      web: {
        label: 'label-for',
        describedBy: 'aria-describedby',
        invalid: 'aria-invalid',
        enterKeyHint: 'next-or-done'
      }
    }
  },
  switch: {
    direction: 'label-then-control',
    control: 'inline-end',
    width: 'stretches',
    gap: 'md',
    align: 'control-centred-on-the-block',
    label: {
      typography: 'bodyM',
      color: 'onSurface',
      lines: 'wraps',
      takes: 'the-rest-of-the-row'
    },
    track: {
      width: 52,
      height: 32,
      radius: 'pill'
    },
    thumb: {
      size: 24,
      inset: 4,
      shape: 'circle',
      on: 'inline-end',
      off: 'inline-start'
    },
    color: {
      on: {
        track: 'primary',
        thumb: 'onPrimary'
      },
      off: {
        track: 'muted',
        thumb: 'surface'
      }
    },
    press: {
      area: 'the-whole-row',
      does: 'toggles-and-writes'
    },
    style: {
      box: 'the-whole-widget-like-every-node',
      color: 'not-read',
      typography: 'not-read'
    },
    semantics: {
      role: 'switch',
      name: 'label',
      state: 'on-off',
      keyboard: 'tab-stop-space-and-enter-toggle'
    }
  },
  checkbox: {
    direction: 'control-then-label',
    control: 'inline-start',
    width: 'stretches',
    gap: 'sm',
    align: 'control-centred-on-the-first-line-of-the-label',
    label: {
      typography: 'bodyM',
      color: 'onSurface',
      lines: 'wraps',
      takes: 'the-rest-of-the-row'
    },
    box: {
      size: 20,
      radius: 4,
      border: {
        width: 2
      }
    },
    mark: {
      icon: 'check',
      size: 16,
      shown: 'when-on'
    },
    color: {
      on: {
        background: 'primary',
        border: 'primary',
        mark: 'onPrimary'
      },
      off: {
        background: 'none',
        border: 'muted'
      }
    },
    indeterminate: 'none',
    press: {
      area: 'the-whole-row',
      does: 'toggles-and-writes'
    },
    style: {
      box: 'the-whole-widget-like-every-node',
      color: 'not-read',
      typography: 'not-read'
    },
    semantics: {
      role: 'checkbox',
      name: 'label',
      state: 'checked-unchecked',
      keyboard: 'tab-stop-space-toggles'
    }
  },
  cases: 'contract/fixtures/inputs/input-cases.json'
} as const

export interface TextFieldMetrics {
  readonly labelLine: number
  readonly textLine: number
  readonly noteLine: number
  readonly gap: number
  readonly paddingBlock: number
  readonly border: number
}

export function textFieldBoxHeightOf(metrics: TextFieldMetrics, lines: unknown): number {
  return 2 * metrics.border + 2 * metrics.paddingBlock + inputLinesOf(lines) * metrics.textLine
}

export function textFieldHeightOf(metrics: TextFieldMetrics, input: { readonly lines?: unknown; readonly labelLines: number; readonly noteLines: number }): number {
  const label = input.labelLines * metrics.labelLine
  const note = input.noteLines === 0 ? 0 : metrics.gap + input.noteLines * metrics.noteLine
  return label + metrics.gap + textFieldBoxHeightOf(metrics, input.lines) + note
}

export function switchHeightOf(labelLine: number, labelLines: number): number {
  return Math.max(INPUTS_LAYOUT.switch.track.height, labelLine * labelLines)
}

export function switchLabelWidthOf(rowWidth: number, gap: number): number {
  return Math.max(0, rowWidth - INPUTS_LAYOUT.switch.track.width - gap)
}

export function checkboxHeightOf(labelLine: number, labelLines: number): number {
  return Math.max(INPUTS_LAYOUT.checkbox.box.size, labelLine * labelLines)
}

export function checkboxLabelWidthOf(rowWidth: number, gap: number): number {
  return Math.max(0, rowWidth - INPUTS_LAYOUT.checkbox.box.size - gap)
}

/** Offset of the checkbox square from the top of the row: its center is on the center of the label's FIRST line. */
export function checkboxBoxOffsetOf(labelLine: number): number {
  return Math.max(0, (labelLine - INPUTS_LAYOUT.checkbox.box.size) / 2)
}

/** Distance of the thumb from the START of the track in the writing direction. */
export function switchThumbOffsetOf(on: boolean): number {
  const { track, thumb } = INPUTS_LAYOUT.switch
  return on ? track.width - thumb.inset - thumb.size : thumb.inset
}
