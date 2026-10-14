/*
 * Next.js is not a dependency of this package, so the one function the Next example calls is
 * declared here. In your application the real declaration comes from `next` itself.
 */
declare module 'next/server' {
  /** Resolves when a request is being served: everything after it runs per request, never at build time. */
  export function connection(): Promise<void>
}
