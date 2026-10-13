/** Flex basics shared by the widgets: the column and the alignment words of the document as CSS values. */
import type { CSSProperties } from 'react'

import { lookup } from '../sanitize'

export const COLUMN: CSSProperties = { display: 'flex', flexDirection: 'column' }

export const ALIGN: Readonly<Record<string, string>> = { start: 'flex-start', center: 'center', end: 'flex-end' }
export const JUSTIFY: Readonly<Record<string, string>> = { ...ALIGN, between: 'space-between' }

/** Looks up an own key of the table: the prop value is a string from the document (`ALIGN['constructor']` is not an alignment). */
export function alignOf(value: unknown, fallback: string): string {
  return lookup(ALIGN, value) ?? lookup(ALIGN, fallback) ?? 'flex-start'
}
