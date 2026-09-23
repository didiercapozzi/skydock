import type { ImportOutcome } from '@skydock/scripts'
import { z } from 'zod'

/* What the window can do that a browser tab cannot, offered by the app around the page: say where a
   dropped file already is. Nothing else of the app is reachable from here. */
declare global {
  interface Window {
    skydock?: { pathOf: (file: File) => string | null }
  }
}

/* Files dragged in from the computer, as opposed to files moved about on the board: the drag says
   so by carrying "Files". Recognising it is also what stops the engine doing what it otherwise does
   with a file nobody wanted, which is to open it over the board. */
const fromComputer = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

/* The bytes a drop hands over. A browser gives them in `files`; where that is empty the same clip
   is in the items of the drag, to be asked for one at a time. */
const droppedFiles = (e: React.DragEvent) => {
  if (e.dataTransfer.files.length > 0) return [...e.dataTransfer.files]
  return [...(e.dataTransfer.items ?? [])]
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile()
      return file ? [file] : []
    })
}

/* Where a dropped file already is, when the window will say. A page has only the bytes, and sending
   forty gigabytes of rushes through a request to a server on the very same machine is a copy nobody
   asked for: given the address, the server reads it where it lies. In a browser there is no address
   to be had, and the bytes are what travel. */
const pathOf = (file: File) => {
  try {
    return window.skydock?.pathOf(file) ?? null
  } catch {
    return null
  }
}

/* What was dropped, whichever the window could give: where the file is, or the file itself. */
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

/* Everything a drop offers, in the order it is worth having: where each file is, and the file
   itself where that cannot be had. */
const droppedIn = (e: React.DragEvent): Dropped[] =>
  droppedFiles(e).map((file) => pathOf(file) ?? file)

export { droppedFiles, droppedIn, fromComputer, importFiles, pathOf }
export type { Dropped }
