import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('hls.js', () => {
  const Hls = vi.fn().mockImplementation(() => ({
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    recoverMediaError: vi.fn(),
    startLoad: vi.fn(),
    currentTime: 0
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
    }
  })
  return { default: Hls }
})
