const isMontage = (group: { montageJump?: boolean }) => group.montageJump === true

const isFiled = (group: { destination?: string; montageJump?: boolean }) =>
  Boolean(group.destination) || isMontage(group)

export { isFiled, isMontage }
