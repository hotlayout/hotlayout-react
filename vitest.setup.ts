/*
 * Test environment. jsdom leaves out a few browser APIs the renderer touches,
 * and nothing here asserts anything: a test that cares about one of them
 * replaces it with its own spy.
 */

// jsdom has no layout, so there is nothing to scroll.
Element.prototype.scrollIntoView = function scrollIntoView(): void {}

// jsdom never reports a size change; the stub notifies nobody on purpose.
globalThis.ResizeObserver = class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Tests never reach the network. A test that needs a response passes its own
// implementation, so the dependency is visible in the test itself.
globalThis.fetch = function fetchIsUnavailable(): Promise<Response> {
  return Promise.reject(new Error('No network in tests: pass your own fetch implementation.'))
}
