/** Which element of a pressable container takes a press by itself. */

/**
 * Elements that take a press by themselves, found by what they are in the markup. The card
 * itself matches (`role="button"`); the walk below stops at the first match.
 */
const CONTROL_SELECTOR = 'button, a[href], input, textarea, select, [role="button"], [role="radio"], [role="tab"], [role="tablist"], [role="switch"], [role="checkbox"]'
/** An input widget takes the press with its whole box, label and note included. */
const CONTROL_TYPES: readonly string[] = ['TextField', 'Switch', 'Checkbox']

/** The innermost control between the target and the card (the card itself when there is none). */
export function controlUnder(target: EventTarget | null, card: HTMLElement): Element {
  let element = target instanceof Element ? target : null
  while (element !== null && element !== card) {
    if (element.matches(CONTROL_SELECTOR) || CONTROL_TYPES.includes(element.getAttribute('data-hl-type') ?? '')) return element
    element = element.parentElement
  }
  return card
}

