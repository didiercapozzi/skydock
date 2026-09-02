import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('hls.js', () => {
  const mockOn = vi.fn()
  const mockLoadSource = vi.fn()
  const mockAttachMedia = vi.fn()
  const mockDestroy = vi.fn()
  const mockRecover = vi.fn()
  const mockStartLoad = vi.fn()
  const Hls = vi.fn().mockImplementation(() => ({
    loadSource: mockLoadSource,
    attachMedia: mockAttachMedia,
    destroy: mockDestroy,
    on: mockOn,
    recoverMediaError: mockRecover,
    startLoad: mockStartLoad,
    currentTime: 0,
    _mocks: { mockOn, mockLoadSource, mockAttachMedia, mockDestroy, mockRecover, mockStartLoad }
  }))
  Object.assign(Hls, {
    isSupported: vi.fn().mockReturnValue(false),
    Events: {
      MANIFEST_PARSED: 'hlsManifestParsed',
      ERROR: 'hlsError'
    },
    ErrorTypes: {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError'
    },
    _reset: () => {
      mockOn.mockClear()
      mockLoadSource.mockClear()
      mockAttachMedia.mockClear()
      mockDestroy.mockClear()
      mockRecover.mockClear()
      mockStartLoad.mockClear()
    }
  })
  return { default: Hls }
})

class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver
  })
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver
  })
}

if (typeof window !== 'undefined' && !(window as unknown as { matchMedia?: unknown }).matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

if (typeof Element !== 'undefined' && Element.prototype) {
  Element.prototype.setPointerCapture =
    vi.fn() as unknown as typeof Element.prototype.setPointerCapture
  Element.prototype.releasePointerCapture =
    vi.fn() as unknown as typeof Element.prototype.releasePointerCapture
}

if (typeof HTMLVideoElement !== 'undefined' && HTMLVideoElement.prototype) {
  if (!HTMLVideoElement.prototype.play) {
    HTMLVideoElement.prototype.play = vi
      .fn()
      .mockResolvedValue(undefined) as unknown as typeof HTMLVideoElement.prototype.play
  }
  if (!HTMLVideoElement.prototype.pause) {
    HTMLVideoElement.prototype.pause = vi.fn() as unknown as typeof HTMLVideoElement.prototype.pause
  }
}
