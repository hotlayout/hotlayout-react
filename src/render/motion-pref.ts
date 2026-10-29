/** Whether the person asked the system to reduce motion; `false` where there is no `matchMedia` (a server render). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
