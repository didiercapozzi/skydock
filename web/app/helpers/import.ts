import { isMediaName } from '../../../packages/skydock-scripts/src/constants'
import type { ImportOutcome } from '@skydock/scripts'
import { z } from 'zod'
import { routingEngine } from './routing'

declare global {
  interface Window {
    skydock?: {
      pathOf: (file: File) => string | null
      chooseWorkFolder?: () => Promise<unknown>
      frame?: {
        minimize: () => void
        toggleMaximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
        onMaximized: (listen: (maximized: boolean) => void) => () => void
      }
      zoom?: {
        get: () => Promise<number>
        set: (factor: number) => Promise<number>
        onChange: (listen: (factor: number) => void) => () => void
      }
    }
  }
}

const fromComputer = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

const droppedFiles = (e: React.DragEvent) => {
  if (e.dataTransfer.files.length > 0) return [...e.dataTransfer.files]
  return [...(e.dataTransfer.items ?? [])]
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile()
      return file ? [file] : []
    })
}

const pathOf = (file: File) => {
  try {
    return window.skydock?.pathOf(file) ?? null
  } catch {
    return null
  }
}

type DroppedAt = { at: string; name: string; size: number; file: File }

type DroppedFolder = { folderAt: string } | { folder: FileSystemDirectoryEntry }

type Dropped = File | DroppedAt | DroppedFolder

const isFolder = (what: Dropped): what is DroppedFolder =>
  !(what instanceof File) && ('folder' in what || 'folderAt' in what)

const isDirectoryEntry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
  entry.isDirectory

const isFileEntry = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile

type Coming = {
  what: File | string
  name: string
  size: number
  file?: File
}

const importAnswerSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum(['added', 'moved', 'copied', 'there', 'kept']).optional(),
  filename: z.string().optional(),
  from: z.string().optional(),
  stays: z.string().optional(),
  reason: z.string().optional(),
  error: z.string().optional()
})

const droppedSchema = z.object({
  files: z.array(z.object({ path: z.string(), name: z.string(), size: z.number() }))
})

const entriesIn = (folder: FileSystemDirectoryEntry) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    const reader = folder.createReader()
    const found: FileSystemEntry[] = []
    const more = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(found)
        found.push(...batch)
        more()
      }, reject)
    more()
  })

const fileOf = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject))

const filesUnder = async (folder: FileSystemDirectoryEntry): Promise<File[]> => {
  const entries = await entriesIn(folder)
  const found = await Promise.all(
    entries.map((entry) =>
      isDirectoryEntry(entry)
        ? filesUnder(entry)
        : isFileEntry(entry)
          ? fileOf(entry).then((file) => [file])
          : Promise.resolve([])
    )
  )
  return found.flat()
}

const whatIsIn = async (paths: string[]) => {
  try {
    const answer = await fetch(routingEngine.href({ url: '/api/dropped' }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths })
    })
    const said = droppedSchema.safeParse(await answer.json())
    return said.success ? said.data.files : []
  } catch {
    return []
  }
}

const whatIsComing = async (list: Dropped[]): Promise<Coming[]> => {
  const folders = list.flatMap((what) =>
    isFolder(what) && 'folderAt' in what ? [what.folderAt] : []
  )
  const toRead = list.flatMap((what) => (isFolder(what) && 'folder' in what ? [what.folder] : []))
  const [inside, ...opened] = await Promise.all([
    folders.length > 0 ? whatIsIn(folders) : Promise.resolve([]),
    ...toRead.map(filesUnder)
  ])
  return [
    ...list.flatMap((what) =>
      !(what instanceof File) && !isFolder(what)
        ? [{ what: what.at, name: what.name, size: what.size, file: what.file }]
        : []
    ),
    ...inside.map((file) => ({ what: file.path, name: file.name, size: file.size })),
    ...[...list.filter((what) => what instanceof File), ...opened.flat()]
      .filter((file) => isMediaName(file.name))
      .map((file) => ({ what: file, name: file.name, size: file.size }))
  ]
}

const keyFor = (index: number) => `drop-${index}`

const tell = (batch: string, what: 'begin' | 'end', body?: object) =>
  fetch(`/api/import?${what}=1&batch=${batch}`, {
    method: 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  }).catch(() => undefined)

const importFiles = async (list: Coming[], target: string, where: string) => {
  const tally: ImportOutcome = { added: [], moved: [], there: 0, kept: [], failed: [], where }
  const batch = crypto.randomUUID()
  await tell(batch, 'begin', {
    batch,
    where,
    files: list.map(({ name, size }, index) => ({ key: keyFor(index), name, size }))
  })
  for (const [index, coming] of list.entries()) {
    const { name, size } = coming
    let { what } = coming
    const watching = { batch, key: keyFor(index), size: String(size) }
    const send = (sending: File | string) =>
      fetch(
        `/api/import?${new URLSearchParams(
          typeof sending === 'string'
            ? { target, path: sending, ...watching }
            : {
                target,
                filename: sending.name,
                lastModified: String(sending.lastModified),
                ...watching
              }
        ).toString()}`,
        { method: 'POST', ...(typeof sending === 'string' ? {} : { body: sending }) }
      )
    try {
      let res = await send(what)
      if (res.status === 422 && typeof what === 'string' && coming.file) {
        const refused = importAnswerSchema.safeParse(await res.clone().json())
        if (refused.success && /not a file this machine can read/.test(refused.data.error ?? '')) {
          what = coming.file
          res = await send(what)
        }
      }
      const answer = importAnswerSchema.safeParse(await res.json())
      const said = answer.success ? answer.data : null
      if (!said?.ok) tally.failed.push(`${name}: ${said?.error ?? 'refused'}`)
      else if (said.outcome === 'moved')
        tally.moved.push({ name: said.filename ?? name, from: said.from ?? 'elsewhere' })
      else if (said.outcome === 'there') tally.there += 1
      else if (said.outcome === 'kept')
        tally.kept.push(`${name} stays where it is — ${said.reason ?? 'it cannot move'}`)
      else tally.added.push(said.filename ?? name)
    } catch {
      tally.failed.push(`${name}: the copy was cut off`)
    }
  }
  await tell(batch, 'end')
  return tally
}

const droppedIn = (e: React.DragEvent): Dropped[] => {
  const items = [...(e.dataTransfer.items ?? [])].filter((item) => item.kind === 'file')
  if (items.length === 0)
    return droppedFiles(e).map((file) => {
      const address = pathOf(file)
      return address ? { at: address, name: file.name, size: file.size, file } : file
    })
  return items.flatMap((item) => {
    const file = item.getAsFile()
    const entry = item.webkitGetAsEntry?.() ?? null
    const address = file ? pathOf(file) : null
    const folder: Dropped | null =
      entry && isDirectoryEntry(entry)
        ? address
          ? { folderAt: address }
          : { folder: entry }
        : null
    const carried: Dropped | null = file
      ? address
        ? { at: address, name: file.name, size: file.size, file }
        : file
      : null
    const what = folder ?? carried
    return what ? [what] : []
  })
}

export { droppedFiles, droppedIn, fromComputer, importFiles, pathOf, whatIsComing }
export type { Coming, Dropped }
