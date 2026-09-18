import type { ImportOutcome } from '@skydock/scripts'
import { z } from 'zod'

/* Files dragged in from the computer, as opposed to files moved about on the board: the browser
   says so by carrying "Files". */
const fromComputer = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

const importAnswerSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum(['added', 'moved', 'there', 'kept']).optional(),
  filename: z.string().optional(),
  from: z.string().optional(),
  reason: z.string().optional(),
  error: z.string().optional()
})

/* Each file is copied to this machine in turn — its bytes sent to the import route beside where it
   goes — and the tally of how it went is what the board is told once all are in. */
const importFiles = async (
  list: FileList,
  target: string,
  where: string,
  onEach: (index: number, total: number, name: string) => void
) => {
  const files = [...list]
  const tally: ImportOutcome = { added: 0, moved: [], there: 0, failed: [], where }
  for (const [index, file] of files.entries()) {
    onEach(index, files.length, file.name)
    const params = new URLSearchParams({
      target,
      filename: file.name,
      lastModified: String(file.lastModified)
    })
    try {
      const res = await fetch(`/api/import?${params.toString()}`, { method: 'POST', body: file })
      const answer = importAnswerSchema.safeParse(await res.json())
      const said = answer.success ? answer.data : null
      if (!said?.ok) tally.failed.push(`${file.name}: ${said?.error ?? 'refused'}`)
      else if (said.outcome === 'moved')
        tally.moved.push({ name: said.filename ?? file.name, from: said.from ?? 'elsewhere' })
      else if (said.outcome === 'there') tally.there += 1
      else if (said.outcome === 'kept')
        tally.failed.push(`${file.name} stayed where it is: ${said.reason ?? 'it cannot move'}`)
      else tally.added += 1
    } catch {
      tally.failed.push(`${file.name}: the copy was cut off`)
    }
  }
  return tally
}

export { fromComputer, importFiles }
