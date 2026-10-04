import { isMediaName } from '../../../packages/skydock-scripts/src/constants'
import type { ImportOutcome } from '@skydock/scripts'
import { z } from 'zod'
import { routingEngine } from './routing'

/* What the window can do that a browser tab cannot, offered by the app around the page: say where a
   dropped file already is, move the work to another folder, and draw the whole board bigger or
   smaller. Nothing else of the app is reachable
   from here. */
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

/* Where a file already is, with what the drag could say about it without opening anything: enough
   to name it and size it in the list, and to hand the server its address instead of its bytes. */
type DroppedAt = { at: string; name: string; size: number; file: File }

/* A folder, which is not copied but opened out. Where its address is known the server finds what is
   inside it, on the machine it was dragged from; where it is not — a browser, with no app around
   the page — the engine names what is in it, and only through the object the drag itself handed
   over, so that object is kept as it is and read out later. */
type DroppedFolder = { folderAt: string } | { folder: FileSystemDirectoryEntry }

/* What was dropped, whichever the window could give */
type Dropped = File | DroppedAt | DroppedFolder

const isFolder = (what: Dropped): what is DroppedFolder =>
  !(what instanceof File) && ('folder' in what || 'folderAt' in what)

const isDirectoryEntry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
  entry.isDirectory

const isFileEntry = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile

/* One file about to be copied in: what to send, and what to call it while it is being sent. */
type Coming = {
  what: File | string
  name: string
  size: number
  /* the file itself, kept beside its address: a server that cannot see the address — a window on one
     machine, the board's server on another — is sent the bytes instead */
  file?: File
}

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

const droppedSchema = z.object({
  files: z.array(z.object({ path: z.string(), name: z.string(), size: z.number() }))
})

/* A folder read out entry by entry. The engine names at most a hundred at a time and says so by
   answering with none, so it is asked again until it does. */
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

/* Every video and photo in a folder and in the folders inside it, as the engine will give them. */
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

/* What the machine holds inside the folders that were let go of: every video and photo, however
   deep. Asked of the server, because the page cannot read a disk — and answered with nothing where
   there is nobody to ask, which is not the same as a folder with nothing in it. */
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

/* Everything a drop really holds, named and sized, before anything is copied — so the board can
   show the whole list and count it down as it goes.

   Only a folder has to be opened out, and only a folder costs anything to work out: a file already
   came with its name, its size and, in SkyDock's own window, its address. */
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

/* What a file of a drop is called while it runs, so the server can say how far through it is and the board
   knows which row that belongs to. A file has no id until its bytes have landed, and its name is no name:
   two cards hold a GX010001.MP4 each. Where it is in the drop is the one thing both ends know before
   anything is sent. */
const keyFor = (index: number) => `drop-${index}`

/* The drop is told to the server before anything is sent — what it is made of, and where it goes — so the
   corner shows the whole list from the first byte and counts it down; and told again when it is over. */
const tell = (batch: string, what: 'begin' | 'end', body?: object) =>
  fetch(`/api/import?${what}=1&batch=${batch}`, {
    method: 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  }).catch(() => undefined)

/* Each file is copied to this machine in turn — its bytes sent to the import route beside where it
   goes, or its address when that is what the drop gave — and the tally of how it went is what the
   board is told once all are in. */
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
      /* the address was the window's, and the server cannot read it: it is somewhere else, so the
         bytes are what travel */
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
      /* added, or already on the board and now in this jump as well — the same thing from here */ else
        tally.added.push(said.filename ?? name)
    } catch {
      tally.failed.push(`${name}: the copy was cut off`)
    }
  }
  await tell(batch, 'end')
  return tally
}

/* Everything a drop offers, taken while the drag's own objects are still alive — what is inside a
   folder is read out afterwards, and by then they are gone.

   Whether a thing is a folder is the engine's to say, and it says so without opening anything. What
   is not a folder is a file, and travels as its address where the window gives one and as its bytes
   where it does not. */
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
