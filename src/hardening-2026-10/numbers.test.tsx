/**
 * Limit 1 — number handling. Earlier passes put ONE hostile number (123 456 789) into every leaf.
 * Every numeric leaf of every contract fixture, every numeric data value and every numeric theme
 * value gets each extreme a network document can carry (`JSON.parse('1e309')` is Infinity; host data
 * can carry NaN directly): the screen must not throw, no style may carry an exponent, `NaN`,
 * `Infinity` or a seven-digit length, and the markup must not explode in size.
 *
 * This file holds the controls; the sweeps are `numbers.<k>.deep.test.tsx`, each file running one
 * slice of every list of cases (`test-support/hardening-numbers-kit.tsx`).
 */
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { badNumberIn } from '../../test-support/hardening-kit'
import { FAKE_TIMERS, NUMBERS_SLICE_COUNT, numericLeafCases, representativeCases, runTransition, screenCases, themeCases, transitionCases } from '../../test-support/hardening-numbers-kit'
import { expectPartition, expectSliceFiles } from '../../test-support/shard'

describe('limit 1: the number guard itself', () => {
  it('catches what it must and passes colours, names and ordinary numbers', () => {
    for (const bad of ['width:1e+300px', 'margin:-1e+300px', 'width:1e-300px', 'width:NaNpx', 'inset:Infinitypx', 'width:12345678px', 'translate:-1.5e-7px 0']) expect(badNumberIn(bad), bad).toBeDefined()
    for (const good of ['color:#1e2a3b', '--hl-c-1e2:#fff', 'width:120px', 'transform:rotate(-45deg)', 'font-weight:600', 'opacity:0.5', 'flex:1 1 0%']) expect(badNumberIn(good), good).toBeUndefined()
  })
})

describe('limit 1: the slices of the sweeps', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('every list of cases is covered exactly once by the slices, and every slice has a file', () => {
    const leaves = numericLeafCases()
    const screens = screenCases()
    const transitions = transitionCases()
    const representatives = representativeCases()
    const theme = themeCases()
    // The lists are not empty: otherwise the sweeps would check nothing.
    expect(leaves.length).toBeGreaterThan(500)
    expect(screens.length).toBeGreaterThan(20)
    expect(transitions.length).toBe(screens.length * 7)
    expect(representatives.length).toBeGreaterThan(50)
    expect(theme.length).toBeGreaterThan(20)
    expectPartition(leaves, NUMBERS_SLICE_COUNT)
    expectPartition(screens, NUMBERS_SLICE_COUNT)
    expectPartition(transitions, NUMBERS_SLICE_COUNT)
    expectPartition(representatives, NUMBERS_SLICE_COUNT)
    expectPartition(theme.map((path) => path.join('\u0000')), NUMBERS_SLICE_COUNT)
    expectSliceFiles('hardening-2026-10', 'numbers', NUMBERS_SLICE_COUNT)
  })

  it('the transition sweep is not empty: some transition does schedule frames', () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    const started = transitionCases().some((job) => runTransition(job).started)
    expect(started, 'no transition ever started: the sweep would be empty').toBe(true)
  })
})
