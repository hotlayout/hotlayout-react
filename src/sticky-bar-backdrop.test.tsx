/**
 * A sticky app bar must not repaint the screen gradient at its own height.
 *
 * With the screen background a top-to-bottom gradient over the whole screen height (violet to
 * teal), the app bar zone takes a copy of the same `background` and would paint the WHOLE
 * gradient into its own 72 px: from the first frame the bar is a violet-to-teal strip with a hard
 * seam under its lower edge, which exists neither in the builder preview nor in
 * `scroll="screen"` mode (there the background is one per screen and the bar is transparent).
 * This happens in the default mode (`scroll="page"`, `chrome="sticky"`).
 *
 * jsdom computes no layout, so the structural condition is asserted: if the app bar zone carries
 * its own gradient, its size or attachment must be named (otherwise the gradient shrinks to the
 * zone height). The fix is not prescribed: the zone may stay transparent over a fixed background,
 * take the solid start colour of the gradient, or set `background-size` / `background-attachment`.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { contractFile } from '../test-support/paths'

import { HotlayoutScreen } from './index'
import type { ThemeContract, UiDocument } from './index'

afterEach(cleanup)

const fixture = JSON.parse(readFileSync(contractFile('fixtures/media-chrome-screens.json'), 'utf8')) as UiDocument
const theme = (JSON.parse(readFileSync(contractFile('theme.json'), 'utf8')) as { contract: ThemeContract }).contract

describe('background of a sticky app bar (scroll="page")', () => {
  it('the fixture screen really has a gradient background — a precondition', () => {
    const { container } = render(<HotlayoutScreen document={fixture} theme={theme} onReport={() => undefined} />)
    const screenNode = container.querySelector<HTMLElement>('[data-hl-type="Screen"]')
    expect(screenNode?.style.backgroundImage ?? '').toContain('gradient')
  })

  it('the app bar zone does not squeeze the screen gradient into its own height', () => {
    const { container } = render(<HotlayoutScreen document={fixture} theme={theme} onReport={() => undefined} />)
    const zone = container.querySelector<HTMLElement>('[data-hl-zone="appBar"]')
    if (zone === null) throw new Error('no app bar zone')

    const paintsGradient = zone.style.backgroundImage.includes('gradient') || zone.style.background.includes('gradient')
    const anchored = zone.style.backgroundSize !== '' || zone.style.backgroundAttachment === 'fixed'
    expect(paintsGradient && !anchored).toBe(false)
  })
})
