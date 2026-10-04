import { vi } from 'vitest'
import '../app/app.css'
import '../app/i18n'

if (typeof window !== 'undefined') {
  localStorage.setItem('skydock.details', 'open')
  ;(window as unknown as Record<string, unknown>).__vite_plugin_react_preamble_installed__ = true
}

vi.stubGlobal(
  'EventSource',
  class {
    onmessage = null
    close = () => {}
  }
)
