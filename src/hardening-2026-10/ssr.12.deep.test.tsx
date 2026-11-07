/** Slice 12 of 12 of the server-render injection sweep; the controls and the explanation are in `ssr.test.tsx`. */
import { describe } from 'vitest'

import { itSsrSweep } from '../../test-support/hardening-ssr-kit'

describe('limit 9: no markup injection and no failed page under a hostile document (slice 12)', () => {
  itSsrSweep(12)
})
