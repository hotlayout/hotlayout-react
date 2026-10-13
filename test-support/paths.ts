/*
 * Where the package and the contract snapshot live, for tests that read files.
 *
 * The package sits in two layouts: a subfolder of the builder repository (the contract is two
 * levels above the package root) and the root of its own repository (the contract is next to
 * `src/`). A test asks here instead of spelling either path.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SRC_DIR = join(PACKAGE_ROOT, 'src')

const SIBLING_CONTRACT = join(PACKAGE_ROOT, 'contract')
export const CONTRACT_DIR = existsSync(SIBLING_CONTRACT) ? SIBLING_CONTRACT : join(PACKAGE_ROOT, '..', '..', 'contract')

/** A file of the package, relative to its root (`package.json`, `LICENSE`). */
export const packageFile = (relative: string): string => join(PACKAGE_ROOT, relative)

/** A file of the contract snapshot, relative to `contract/` (`theme.json`, `fixtures/…`). */
export const contractFile = (relative: string): string => join(CONTRACT_DIR, relative)
