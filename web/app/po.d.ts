/* a catalog of translations, compiled as it is imported */
declare module '*.po' {
  import type { Messages } from '@lingui/core'
  const messages: Messages
  export { messages }
}
