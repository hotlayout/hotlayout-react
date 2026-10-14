/**
 * The loaders tell a layout document from a theme and from anything else.
 *
 * A file of the wrong kind at the address used to pass and end as an empty or refused screen far
 * from the cause. The check is the kind only (the fields without which the reader draws nothing),
 * never the content: a document of another schema version still loads.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { contractFile } from '../test-support/paths'
import { HotlayoutLoadError, loadDocument, loadTheme } from './index'

const DOCUMENT: unknown = JSON.parse(readFileSync(contractFile('fixtures/minimal-screen.json'), 'utf8'))
const THEME: unknown = (JSON.parse(readFileSync(contractFile('theme.json'), 'utf8')) as { contract: unknown }).contract
const URL = 'https://files.example/published.json'

/** A loader option: a server that answers with this body. */
function answering(body: unknown, init: ResponseInit = {}): { fetch: typeof globalThis.fetch } {
  return { fetch: (() => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, ...init }))) as typeof globalThis.fetch }
}

async function failure(run: Promise<unknown>): Promise<HotlayoutLoadError> {
  try {
    await run
  } catch (error) {
    if (error instanceof HotlayoutLoadError) return error
    throw error
  }
  throw new Error('the loader did not fail')
}

describe('loadDocument', () => {
  it('a document is returned as it is', async () => {
    expect(await loadDocument(URL, answering(DOCUMENT))).toEqual(DOCUMENT)
  })

  it('the content is not judged: a document of a version the reader does not know still loads', async () => {
    const future = { schemaVersion: '99.0.0', screens: [] }
    expect(await loadDocument(URL, answering(future))).toEqual(future)
  })

  it('a theme at the address of a document: the error names the swap', async () => {
    const error = await failure(loadDocument(URL, answering(THEME)))
    expect(error.message).toBe(`The file at ${URL} is a theme, not a layout document: the two addresses may be swapped.`)
    expect(error).toMatchObject({ url: URL, status: 200 })
  })

  it.each([
    ['an unrelated object', { ok: true }],
    ['a version without screens', { schemaVersion: '9.19.0' }],
    ['screens that are not a list', { schemaVersion: '9.19.0', screens: {} }],
    ['a version that is not a string', { schemaVersion: 9, screens: [] }],
  ])('%s is not a layout document, and the error says what is missing', async (_name, body) => {
    const error = await failure(loadDocument(URL, answering(body)))
    expect(error.message).toBe(`The file at ${URL} is not a layout document: it has no \`schemaVersion\` or no list of \`screens\`.`)
    expect(error.status).toBe(200)
  })

  it.each([
    ['an array', [DOCUMENT]],
    ['a string', 'a document'],
    ['null', null],
    ['a number', 7],
  ])('%s is not a JSON object', async (_name, body) => {
    const error = await failure(loadDocument(URL, answering(JSON.stringify(body))))
    expect(error.message).toBe(`The layout document at ${URL} is not a JSON object.`)
  })

  it('a page with status 200 instead of JSON: the error says what the server sent', async () => {
    const error = await failure(loadDocument(URL, answering('<!doctype html><title>App</title>', { headers: { 'content-type': 'text/html; charset=utf-8' } })))
    expect(error.message).toBe(`The layout document at ${URL} is not JSON: the server answered 200 with text/html; charset=utf-8. Check the address.`)
    expect(error).toMatchObject({ url: URL, status: 200 })
  })
})

describe('loadTheme', () => {
  it('a theme is returned as it is', async () => {
    expect(await loadTheme(URL, answering(THEME))).toEqual(THEME)
  })

  it('a document at the address of a theme: the error names the swap', async () => {
    const error = await failure(loadTheme(URL, answering(DOCUMENT)))
    expect(error.message).toBe(`The file at ${URL} is a layout document, not a theme: the two addresses may be swapped.`)
  })

  it.each([
    ['an unrelated object', { ok: true }],
    ['a version without themes', { themeContractVersion: '4.0.1' }],
    ['themes that are a list', { themeContractVersion: '4.0.1', themes: [] }],
    ['themes that are null', { themeContractVersion: '4.0.1', themes: null }],
  ])('%s is not a theme, and the error says what is missing', async (_name, body) => {
    const error = await failure(loadTheme(URL, answering(body)))
    expect(error.message).toBe(`The file at ${URL} is not a theme: it has no \`themeContractVersion\` or no \`themes\`.`)
  })

  it.each([
    ['an array', '[]'],
    ['a string', '"theme"'],
    ['null', 'null'],
  ])('%s is not a JSON object', async (_name, body) => {
    expect((await failure(loadTheme(URL, answering(body)))).message).toBe(`The theme at ${URL} is not a JSON object.`)
  })

  it('not JSON, and the server named no content type', async () => {
    const error = await failure(loadTheme(URL, { fetch: (() => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token')) })) as unknown as typeof globalThis.fetch }))
    expect(error.message).toBe(`The theme at ${URL} is not JSON: the server answered 200. Check the address.`)
  })
})
