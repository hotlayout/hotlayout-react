/**
 * Regenerate `src/icon-set.ts` from `contract/icons.json`.
 *
 * Run: `npm run icons:sync` in the root of this package.
 *
 * A copy rather than an import: the package imports nothing from the sources
 * of the contract and ships on its own, and an icon name is document data, so the
 * reader needs the WHOLE set (the contract has no network delivery of icons).
 * The generated file is never edited by hand; a package test compares it with
 * the artifact by content.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// The contract snapshot lies next to the package in its own repository and three
// levels up when the package sits in the repository of the builder.
const artifactPath = ['../contract/icons.json', '../../../contract/icons.json'].map((path) => join(here, path)).find((path) => existsSync(path))
if (artifactPath === undefined) throw new Error('contract/icons.json not found')
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))

const text = `/**
 * Icon set: a copy of \`contract/icons.json\` (grid and drawing bodies for every
 * \`IconToken\` name).
 *
 * GENERATED, do not edit by hand: \`npm run icons:sync\` in the root of the package
 * (\`scripts/sync-icons.mjs\`). A package test compares \`ICON_GRID\` and
 * \`ICON_BODIES\` with the artifact by content.
 *
 * Drawings are Lucide (ISC) plus ten of our own; see \`THIRD-PARTY-NOTICES.md\`
 * in the package for the license and origin.
 */

/** Version of the drawings, independent of the schema version. */
export const ICON_SET_VERSION = ${JSON.stringify(artifact.iconSetVersion)}

/** Shared \`<svg>\` root: everything a body element does not override itself. */
export const ICON_GRID = ${JSON.stringify(artifact.grid, null, 2)} as const

/** Icon name to inner \`<svg>\` elements. \`currentColor\` is the node foreground colour. */
export const ICON_BODIES: Readonly<Record<string, string>> = ${JSON.stringify(artifact.icons, null, 2)}
`
writeFileSync(join(here, '../src/icon-set.ts'), text)
console.log(`icon-set.ts: ${String(Object.keys(artifact.icons).length)} icons, set ${artifact.iconSetVersion}`)
