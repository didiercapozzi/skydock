/* A jump of a montage: a film made for someone, named once. It belongs to no destination — it is
   marked as a montage's, and that is all. */
const isMontage = (group: { montageJump?: boolean }) => group.montageJump === true

/* A jump that has left Fresh files: filed under a destination, or made a montage. */
const isFiled = (group: { destination?: string; montageJump?: boolean }) =>
  Boolean(group.destination) || isMontage(group)

export { isFiled, isMontage }
