/* Whether a key pressed belongs to a field being typed in — which the board's own shortcuts then
   leave alone, so typing an R in a name never turns a picture. */
const typingInField = (e: KeyboardEvent) =>
  e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)

export { typingInField }
