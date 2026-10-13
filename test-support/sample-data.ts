/*
 * Host data for tests, built from the data-dictionary artifact: every path gets its sample
 * value, and every list gets one record made of the dictionary's fields for its entity.
 */
import { readFileSync } from 'node:fs'

import type { Collections, DataScope } from '../src/index'

import { contractFile } from './paths'

interface DictionaryArtifact {
  readonly contract: {
    readonly paths: readonly { readonly path: string; readonly sampleValue: unknown }[]
    readonly collections: readonly { readonly path: string; readonly item: string }[]
  }
}

const { paths, collections: lists } = (JSON.parse(readFileSync(contractFile('data-contract.json'), 'utf8')) as DictionaryArtifact).contract

/** Names of the dictionary's lists. */
export const COLLECTION_PATHS: readonly string[] = lists.map((list) => list.path)

export function sampleData(): { readonly data: DataScope; readonly collections: Collections } {
  const data: Record<string, unknown> = {}
  for (const entry of paths) data[entry.path] = entry.sampleValue
  const collections: Record<string, readonly Readonly<Record<string, unknown>>[]> = {}
  for (const list of lists) {
    const prefix = `${list.item}.`
    const record: Record<string, unknown> = {}
    for (const entry of paths) if (entry.path.startsWith(prefix)) record[entry.path.slice(prefix.length)] = entry.sampleValue
    collections[list.path] = [record]
  }
  return { data, collections }
}
