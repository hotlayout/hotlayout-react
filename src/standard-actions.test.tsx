/**
 * STANDARD ACTION HELPER (`runStandardAction`, schema 9.8.0): it acts only on a validated action,
 * and the host is the only one that opens anything. Tests with a host that builds the action by
 * hand, and with an action that came from a document through a real screen.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen, openInNewTab, runStandardAction } from './index'
import type { HotlayoutAction, UiDocument } from './index'

afterEach(cleanup)

function handlers() {
  const calls: string[] = []
  return {
    calls,
    all: {
      openUrl: (url: string) => void calls.push(`open:${url}`),
      deeplinkSchemes: ['myapp'],
      openDeeplink: (url: string) => void calls.push(`deeplink:${url}`),
      close: () => void calls.push('close'),
    },
  }
}

describe('runStandardAction', () => {
  it('runs a validated action: openUrl, deeplink with an allowed scheme, close', () => {
    const { calls, all } = handlers()
    expect(runStandardAction({ type: 'openUrl', standard: { type: 'openUrl', url: 'https://example.com/a' } }, all)).toBe(true)
    expect(runStandardAction({ type: 'deeplink', standard: { type: 'deeplink', url: 'myapp://offers/42', scheme: 'myapp' } }, all)).toBe(true)
    expect(runStandardAction({ type: 'close', standard: { type: 'close' } }, all)).toBe(true)
    expect(calls).toEqual(['open:https://example.com/a', 'deeplink:myapp://offers/42', 'close'])
  })

  it('an invalid or custom action gives false, no handlers are called', () => {
    const { calls, all } = handlers()
    expect(runStandardAction({ type: 'openUrl', invalid: { param: 'url', problem: 'not-https' } }, all)).toBe(false)
    expect(runStandardAction({ type: 'share', params: { url: 'https://example.com' } }, all)).toBe(false)
    expect(runStandardAction({ type: 'openUrl', params: { url: 'https://example.com' } }, all)).toBe(false)
    expect(calls).toEqual([])
  })

  it('deeplink without a host scheme list never runs; a scheme outside the list does not either', () => {
    const { calls, all } = handlers()
    const action: HotlayoutAction = { type: 'deeplink', standard: { type: 'deeplink', url: 'myapp://offers/42', scheme: 'myapp' } }
    expect(runStandardAction(action, { openDeeplink: all.openDeeplink })).toBe(false)
    expect(runStandardAction(action, { ...all, deeplinkSchemes: [] })).toBe(false)
    expect(runStandardAction(action, { ...all, deeplinkSchemes: ['tel'] })).toBe(false)
    expect(runStandardAction(action, { deeplinkSchemes: ['myapp'] })).toBe(false)
    expect(calls).toEqual([])
  })

  it('without a handler the action does not run: there is no default window.open', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      expect(runStandardAction({ type: 'openUrl', standard: { type: 'openUrl', url: 'https://example.com' } }, {})).toBe(false)
      expect(runStandardAction({ type: 'close', standard: { type: 'close' } }, {})).toBe(false)
      expect(open).not.toHaveBeenCalled()
    } finally {
      open.mockRestore()
    }
  })

  it('an object built by hand with an address of the wrong shape does not become "validated"', () => {
    const { calls, all } = handlers()
    expect(runStandardAction({ type: 'openUrl', standard: { type: 'openUrl', url: 'javascript:alert(1)' } }, all)).toBe(false)
    expect(runStandardAction({ type: 'openUrl', standard: { type: 'openUrl', url: 'https://bank.example@evil.example' } }, all)).toBe(false)
    expect(runStandardAction({ type: 'deeplink', standard: { type: 'deeplink', url: 'javascript:alert(1)', scheme: 'javascript' } }, { ...all, deeplinkSchemes: ['javascript'] })).toBe(false)
    expect(runStandardAction({ type: 'deeplink', standard: { type: 'deeplink', url: 'myapp://x', scheme: 'other' } }, { ...all, deeplinkSchemes: ['other', 'myapp'] })).toBe(false)
    expect(runStandardAction({ type: 'openUrl', standard: { type: 'unknown' } as never }, all)).toBe(false)
    expect(calls).toEqual([])
  })

  it('openInNewTab opens with noopener,noreferrer, and only when the host called it', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      expect(open).not.toHaveBeenCalled()
      openInNewTab('https://example.com/a')
      expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer')
    } finally {
      open.mockRestore()
    }
  })
})

describe('the helper on an action from a document, end to end', () => {
  const documentOf = (action: unknown): UiDocument =>
    ({
      schemaVersion: '9.8.0',
      documentId: 'h',
      name: 'h',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'go', type: 'Button', props: { label: { kind: 'literal', value: 'go' }, action } }] } }],
    })

  const press = (action: unknown, data: Record<string, unknown>, host: Parameters<typeof runStandardAction>[1]): boolean[] => {
    const ran: boolean[] = []
    const view = render(<HotlayoutScreen document={documentOf(action)} data={data} onAction={(handed) => ran.push(runStandardAction(handed, host))} onReport={() => undefined} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    view.unmount()
    return ran
  }

  it('an address from data that failed the shape check does not run, even with openUrl present', () => {
    const { calls, all } = handlers()
    const action = { type: 'openUrl', params: { url: 'https://example.com/safe' }, paramBindings: { url: 'offer.url' } }
    expect(press(action, { 'offer.url': 'javascript:alert(document.cookie)' }, all)).toEqual([false])
    expect(press(action, { 'offer.url': 'https://partner.example.com/o/42' }, all)).toEqual([true])
    expect(calls).toEqual(['open:https://partner.example.com/o/42'])
  })

  it('an app link from a document runs only with a host scheme', () => {
    const { calls, all } = handlers()
    const action = { type: 'deeplink', params: { url: 'myapp://offers/weekend' } }
    expect(press(action, {}, { openDeeplink: all.openDeeplink })).toEqual([false])
    expect(press(action, {}, all)).toEqual([true])
    expect(press({ type: 'deeplink', params: { url: 'intent://scan/#Intent;scheme=zxing;end' } }, {}, { ...all, deeplinkSchemes: ['intent'] })).toEqual([false])
    expect(calls).toEqual(['deeplink:myapp://offers/weekend'])
  })
})
