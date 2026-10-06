import type { Config } from '@react-router/dev/config'

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  /* Every route is known to the page from the start. Left to discover them as links appear, the page asks the
     server about a place the moment it is added or shown, and a click made while that is being answered can
     leave the address changed and the page not. The routes are few and the server is on this machine. */
  routeDiscovery: { mode: 'initial' }
} satisfies Config
