/**
 * Docs example ("Data dictionary" → "What a document reads"): which data a published document
 * reads and writes. Plain Node, no dependencies. A test runs it over the contract fixtures.
 */
// #region list-paths
// node list-paths.mjs published.json
import { readFileSync } from 'node:fs'

const layout = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const reads = new Set()
const writes = new Set()
const lists = new Set()
const INPUTS = ['TextField', 'Switch', 'Checkbox', 'ChoiceGroup']

function walk(value) {
  if (Array.isArray(value)) return value.forEach(walk)
  if (value === null || typeof value !== 'object') return
  // A bound value (`kind: "binding"`) or a condition (`visibleIf`, `disabledIf`, `styleWhen[].when`).
  if (typeof value.path === 'string' && (value.kind === 'binding' || 'op' in value)) reads.add(value.path)
  // An icon named by the data, and action parameters taken from the data.
  if (typeof value.iconPath === 'string') reads.add(value.iconPath)
  for (const path of Object.values(value.paramBindings ?? {})) reads.add(path)
  // A list drawn from a collection.
  if (value.type === 'Repeater' && typeof value.props?.source === 'string') lists.add(value.props.source)
  // What the screen writes: inputs, and buttons with a write action.
  if (INPUTS.includes(value.type) && typeof value.props?.value?.path === 'string') writes.add(value.props.value.path)
  if ((value.type === 'setValue' || value.type === 'toggleValue') && typeof value.params?.path === 'string') writes.add(value.params.path)
  Object.values(value).forEach(walk)
}

walk(layout.screens)
for (const [name, found] of Object.entries({ collections: lists, reads, writes })) console.log(`${name}: ${[...found].sort().join(', ')}`)
// #endregion
