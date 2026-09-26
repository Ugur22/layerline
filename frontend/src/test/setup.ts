import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only auto-registers cleanup when test globals are enabled; we import explicitly.
afterEach(cleanup)

// jsdom has no ResizeObserver, which Recharts' responsive container needs; it renders at its
// initial size instead of measuring.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub
