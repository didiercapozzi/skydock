import { vi } from 'vitest'
import '../app/app.css'
/* every sentence is read in English here, as the tests are written */
import '../app/i18n'

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__vite_plugin_react_preamble_installed__ = true
}

/* The board keeps a stream open to the machine, and in these tests there is no machine behind it:
   the real thing would knock on the test runner's own server for as long as a board is drawn, and
   keep it from closing. So the stream is silent here unless a test stands in one that talks. */
vi.stubGlobal(
  'EventSource',
  class {
    onmessage = null
    close = () => {}
  }
)
