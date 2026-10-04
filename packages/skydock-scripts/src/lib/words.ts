const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

const idsOf = (files: { id?: string }[]) => files.flatMap((f) => (f.id ? [f.id] : []))

export { idsOf, messageOf }
