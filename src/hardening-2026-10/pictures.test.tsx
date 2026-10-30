/**
 * Limit 2 — pictures. A picture address is a request the HOST page makes on behalf of its user. The
 * default rule (no `resolveImageUrl`) is "absolute https". What that rule still lets through:
 * literal IP addresses (loopback, private ranges, the cloud metadata address, any numeral system),
 * `localhost` and credentials in the address; and what the request carries: the `Referer` of the
 * host page. The `https` form of `openUrl` (`x-actions.forms.httpsUrl`) already refuses all of these
 * for a link; a picture loads WITHOUT a click, so it should not be looser than a link.
 *
 * Browsers bound the decoding of a huge picture themselves; that is noted in the review, not tested.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../index'
import type { UiDocument, UiNode } from '../index'
import { imagePolicy } from '../images'
import { serverMarkup } from '../../test-support/hardening-kit'

afterEach(cleanup)

function screenWith(children: readonly UiNode[]): UiDocument {
  return {
    schemaVersion: '9.27.0',
    documentId: 'pictures',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

const image = (id: string, url: string): UiNode => ({ id, type: 'Image', props: { source: { kind: 'url', url }, alt: 'x', fit: 'cover' } }) as unknown as UiNode
const boundImage = (id: string, path: string): UiNode => ({ id, type: 'Image', props: { source: { kind: 'binding', path, fallback: 'logo' }, alt: 'x', fit: 'cover' } }) as unknown as UiNode

/** Addresses that reach a machine on the user's own network or the host's own origin, or carry credentials. */
const NOT_A_PUBLIC_PICTURE = [
  'https://127.0.0.1/a.png',
  'https://127.1/a.png',
  'https://2130706433/a.png',
  'https://0x7f000001/a.png',
  'https://0177.0.0.1/a.png',
  'https://10.0.0.1/a.png',
  'https://192.168.1.1/router.png',
  'https://172.16.0.1/a.png',
  'https://169.254.169.254/latest/meta-data/',
  'https://[::1]/a.png',
  'https://[::ffff:127.0.0.1]/a.png',
  'https://localhost/a.png',
  'https://localhost:8443/a.png',
  'https://user:secret@cdn.example/a.png',
  'https://cdn.example.com@192.168.1.1/a.png',
]

describe('limit 2: the default picture rule', () => {
  it('a plain public https picture loads (control)', () => {
    const html = serverMarkup(screenWith([image('i', 'https://cdn.example.com/a.png')]))
    expect(html).toContain('src="https://cdn.example.com/a.png"')
  })

  it('LIMIT HOLDS (fixed in 0.25.0): an IP literal, localhost or an address with credentials is not loaded without the host’s word', () => {
    const policy = imagePolicy(undefined)
    const loaded = NOT_A_PUBLIC_PICTURE.filter((url) => policy.src(url, 'image', 'document') !== undefined || policy.src(url, 'image', 'data') !== undefined)
    expect(loaded, 'loaded by default').toEqual([])
  })

  it('LIMIT HOLDS (fixed in 0.25.0): the same addresses from DATA give a placeholder on a real screen', () => {
    for (const url of ['https://192.168.1.1/router.png', 'https://169.254.169.254/latest/meta-data/', 'https://localhost/a.png']) {
      const html = serverMarkup(screenWith([boundImage('i', 'item.image')]), { data: { 'item.image': url } })
      expect(html, url).not.toContain(`src="${url}"`)
    }
  })

  it('LIMIT HOLDS (fixed in 0.25.0): a picture does not send the host page address as Referer (referrerpolicy="no-referrer")', () => {
    const { container } = render(<HotlayoutScreen document={screenWith([image('i', 'https://cdn.example.com/a.png')])} onReport={() => undefined} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('a picture is not a credentialed CORS request: no crossorigin attribute (control)', () => {
    const { container } = render(<HotlayoutScreen document={screenWith([image('i', 'https://cdn.example.com/a.png')])} onReport={() => undefined} />)
    expect(container.querySelector('img')?.hasAttribute('crossorigin')).toBe(false)
    expect(container.querySelector('img')?.hasAttribute('srcset')).toBe(false)
  })

  it('a background image takes the same path: an IP literal in style.background never becomes url() by default', () => {
    const policy = imagePolicy(undefined)
    expect(policy.css('https://cdn.example.com/a.png', 'background', 'document')).toBeDefined()
    expect(policy.css('http://cdn.example.com/a.png', 'background', 'document')).toBeUndefined()
  })
})

describe('limit 2: the one exception the host cannot override — a script address is never a picture', () => {
  it('LIMIT HOLDS (fixed in 0.25.0): control characters and tabs the URL parser strips do not hide the scheme', () => {
    const anything = imagePolicy((url) => url)
    // The WHATWG URL parser strips leading C0 controls and removes tab / line feed / carriage return anywhere,
    // so each of these is `javascript:` to the browser.
    const hidden = ['\u0001javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'vb\rscript:x', '\u0000javascript:alert(1)']
    const passed = hidden.filter((url) => anything.src(url, 'image', 'data') !== undefined).map((url) => JSON.stringify(url))
    expect(passed).toEqual([])
  })
})
