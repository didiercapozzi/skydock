import type { ImportOutcome } from '@skydock/scripts'
import { z } from 'zod'

/* Files dragged in from the computer, as opposed to files moved about on the board. Every engine
   says it in its own words: one puts "Files" among the types, another — a drag out of the machine's
   own file manager, into SkyDock's own window — carries the list of addresses instead, and the items
   themselves are the plainest answer of the three. Asking only the first is why a clip dropped on
   that window opened over the board rather than being taken into it: nothing recognised the drag,
   so nothing stopped the engine doing what it does with a file nobody wanted. */
const fromComputer = (e: React.DragEvent) =>
  e.dataTransfer.types.includes('Files') ||
  e.dataTransfer.types.includes('text/uri-list') ||
  [...(e.dataTransfer.items ?? [])].some((item) => item.kind === 'file')

/* The bytes a drop hands over, when it hands over any. One engine fills `files`; another leaves it
   empty and holds the same clip in the items of the drag, to be asked for one at a time. */
const droppedFiles = (e: React.DragEvent) => {
  if (e.dataTransfer.files.length > 0) return [...e.dataTransfer.files]
  return [...(e.dataTransfer.items ?? [])]
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile()
      return file ? [file] : []
    })
}

/* And where the file is, when that is all a drop hands over. SkyDock's own window gives no bytes at
   all — only `text/uri-list`, the addresses of what was dragged — and a page cannot open a file by
   its address. The machine can: the app's own server is on the very machine the file was dragged
   from, so it is read from there instead. One address per line, comments and all, as the list
   format has it; anything that is not a file on this machine is passed over. */
const droppedPaths = (e: React.DragEvent) =>
  e.dataTransfer
    .getData('text/uri-list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .flatMap((line) => {
      /* a bare path, where an engine gives one rather than an address */
      if (line.startsWith('/')) return [line]
      if (!line.startsWith('file://')) return []
      try {
        return [decodeURIComponent(new URL(line).pathname)]
      } catch {
        return []
      }
    })

/* What was dropped, whichever of the two the engine gave: the file itself, or where it is. */
type Dropped = File | string

const nameOf = (what: Dropped) =>
  typeof what === 'string' ? (what.split('/').pop() ?? what) : what.name

const importAnswerSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum(['added', 'moved', 'copied', 'there', 'kept']).optional(),
  filename: z.string().optional(),
  from: z.string().optional(),
  /* where footage taken into a jump goes on living as well */
  stays: z.string().optional(),
  reason: z.string().optional(),
  error: z.string().optional()
})

/* Each file is copied to this machine in turn — its bytes sent to the import route beside where it
   goes, or its address when that is what the drop gave — and the tally of how it went is what the
   board is told once all are in. */
const importFiles = async (
  list: Dropped[],
  target: string,
  where: string,
  onEach: (index: number, total: number, name: string) => void
) => {
  const tally: ImportOutcome = { added: [], moved: [], there: 0, kept: [], failed: [], where }
  for (const [index, what] of list.entries()) {
    const name = nameOf(what)
    onEach(index, list.length, name)
    const params = new URLSearchParams(
      typeof what === 'string'
        ? { target, path: what }
        : { target, filename: what.name, lastModified: String(what.lastModified) }
    )
    try {
      const res = await fetch(`/api/import?${params.toString()}`, {
        method: 'POST',
        ...(typeof what === 'string' ? {} : { body: what })
      })
      const answer = importAnswerSchema.safeParse(await res.json())
      const said = answer.success ? answer.data : null
      if (!said?.ok) tally.failed.push(`${name}: ${said?.error ?? 'refused'}`)
      else if (said.outcome === 'moved')
        tally.moved.push({ name: said.filename ?? name, from: said.from ?? 'elsewhere' })
      else if (said.outcome === 'there') tally.there += 1
      else if (said.outcome === 'kept')
        tally.kept.push(`${name} stays where it is — ${said.reason ?? 'it cannot move'}`)
      /* added, or already on the board and now in this jump as well — the same thing from here */ else
        tally.added.push(said.filename ?? name)
    } catch {
      tally.failed.push(`${name}: the copy was cut off`)
    }
  }
  return tally
}

/* Everything a drop offers, in the order it is worth having: the bytes if there are any, and
   otherwise where to find them. */
const droppedIn = (e: React.DragEvent): Dropped[] => {
  const files = droppedFiles(e)
  return files.length > 0 ? files : droppedPaths(e)
}

export { droppedFiles, droppedIn, droppedPaths, fromComputer, importFiles }
export type { Dropped }
