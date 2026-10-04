const typingInField = (e: KeyboardEvent) =>
  e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)

export { typingInField }
