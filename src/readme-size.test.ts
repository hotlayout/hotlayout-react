/**
 * The README is the introduction shown on the package page; the reference lives on the
 * documentation site. Without a limit, every new feature added a section to the README until it
 * was 2400 lines long.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { packageFile } from '../test-support/paths'

const MAX_LINES = 350

describe('package README', () => {
  it('stays an introduction: the reference lives on hotlayout.com/docs', () => {
    const lines = readFileSync(packageFile('README.md'), 'utf8').split('\n').length
    expect(lines, `README.md is ${lines} lines (limit ${MAX_LINES}). The reference lives on hotlayout.com/docs; the README is the introduction. Put the new section on the documentation site and link it from here.`).toBeLessThanOrEqual(MAX_LINES)
  })
})
