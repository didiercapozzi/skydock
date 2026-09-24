/* What went wrong, in words: an error's own message, or whatever was thrown, as text. */
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/* the ids of some files, leaving out any file that has none yet */
const idsOf = (files: { id?: string }[]) => files.flatMap((f) => (f.id ? [f.id] : []))

export { idsOf, messageOf }
