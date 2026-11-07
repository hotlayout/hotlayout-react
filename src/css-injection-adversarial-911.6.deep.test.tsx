/** Slice 6 of 32 of the hostile-value sweep; the controls and the explanation are in `css-injection-adversarial-911.test.tsx`. */
import { cleanup } from '@testing-library/react'
import { afterEach, describe } from 'vitest'

import { itBrowserSweep, itServerSweep } from '../test-support/css-injection-kit'

afterEach(cleanup)

describe('9.9-9.11: hostile values at every document path (slice 6)', () => {
  itServerSweep(6)
  itBrowserSweep(6)
})
