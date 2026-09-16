import {
  loadManifest,
  loadNasSession,
  manifestFileSchema,
  manifestGroupSchema
} from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { ComparisonDialog } from '../components/comparison-dialog'
import { PreviewDrawer } from '../components/preview-drawer'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { formatSize, formatTime, getThumbUrl, isVideoFile, minFileMtime } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'
import { useGroups } from '../hooks/useJumps'
import { usePreview } from '../hooks/usePreview'
import type { Route } from './+types/board'

const TANDEMS = 'Tandems'

const montageResponseSchema = z.object({
  ok: z.boolean().optional(),
  error: z.string().optional(),
  projectPath: z.string().optional(),
  photosZip: z.string().nullable().optional(),
  rushesZip: z.string().nullable().optional(),
  clips: z.number().optional()
})

const loader = async (_args: Route.LoaderArgs) => {
  const outputDir = process.env.SKYDOCK_OUTPUT_DIR ?? '/workspace/output'
  let manifest = null
  try {
    manifest = loadManifest(`${outputDir}/manifest.json`)
  } catch {
    manifest = null
  }
  let nas: { connected: boolean; defaultFolder: string | null } = {
    connected: false,
    defaultFolder: null
  }
  try {
    const session = loadNasSession()
    if (session) nas = { connected: true, defaultFolder: session.defaultFolder ?? null }
  } catch {
    nas = { connected: false, defaultFolder: null }
  }
  const grouped = new Set(
    (manifest?.groups ?? []).flatMap((g) => g.files.map((f) => f.id ?? f.path))
  )
  const looseFiles = (manifest?.files ?? []).filter((f) => !grouped.has(f.id ?? f.path))
  return {
    groups: manifest?.groups ?? [],
    looseFiles,
    destinations: manifest?.destinations ?? [],
    hasManifest: manifest !== null,
    nas
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/* local calendar day, and a label built without Intl so the server and the client agree */
const dayOfMtime = (mtime: number) => {
  const d = new Date(mtime * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const dayOf = (group: ManifestGroup) => {
  const min = minFileMtime(group.files)
  return min === null ? group.day : dayOfMtime(min)
}

const dayOfFile = (file: ManifestFile) => dayOfMtime(file.mtime)

const dayLabel = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  return `${date} ${MONTHS[month - 1]} ${year}`
}

const passengerName = (group: ManifestGroup) =>
  group.passenger ? `${group.passenger.firstname} ${group.passenger.lastname}`.trim() : ''

const isTandem = (group: ManifestGroup) => group.destination === TANDEMS
const videosOf = (files: ManifestFile[]) => files.filter((f) => isVideoFile(f.path))
const photosOf = (files: ManifestFile[]) => files.filter((f) => !isVideoFile(f.path))

/* A card of ordinary size shows its files straight away and carries no fold button at all —
   reaching a file costs no click. Past this many, an open card buries everything under it, so it
   folds by default and gains Hide / Show N files. */
const FOLD_MIN = 25
const foldable = (files: ManifestFile[]) => files.length > FOLD_MIN

const CAPTION = 'text-[11px] font-semibold tracking-wide text-gray-500 uppercase'

const byMtime = (files: ManifestFile[]) => [...files].sort((a, b) => a.mtime - b.mtime)

const byMin = (groups: ManifestGroup[]) =>
  [...groups].sort((a, b) => (minFileMtime(a.files) ?? 0) - (minFileMtime(b.files) ?? 0))

const Thumb = ({
  file,
  selected,
  picking,
  onClick,
  onDragStart,
  small
}: {
  file: ManifestFile
  selected: boolean
  /* a selection is under way somewhere on the board — every thumbnail shows its mark */
  picking: boolean
  onClick: (e: React.MouseEvent) => void
  onDragStart?: (e: React.DragEvent) => void
  small?: boolean
}) => (
  <div className='relative'>
    <button
      type='button'
      draggable={onDragStart !== undefined}
      onDragStart={onDragStart}
      onClick={onClick}
      title={`${file.filename} · ${formatTime(file.mtime)} · ${formatSize(file.size)}`}
      className={`block overflow-hidden rounded border-2 bg-gray-100 ${
        small ? 'h-10 w-10' : 'h-12 w-16'
      } ${selected ? 'border-teal-600 ring-2 ring-teal-200' : 'border-gray-200'}`}>
      <img
        src={getThumbUrl(file.path, 0.5, small ? 80 : 120)}
        alt={file.filename}
        loading='lazy'
        className='h-full w-full object-cover'
      />
    </button>
    {(picking || selected) && (
      <span
        className={`pointer-events-none absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] leading-none ${
          selected
            ? 'border-teal-600 bg-teal-600 text-white'
            : 'border-gray-400 bg-white text-white'
        }`}>
        ✓
      </span>
    )}
  </div>
)

/* what every thumbnail wall needs from the board: what is picked, and where clicks and drags go */
type WallHooks = {
  picked: string[]
  onFile: (
    file: ManifestFile,
    lane: ManifestFile[],
    e: React.MouseEvent,
    onPreview: () => void
  ) => void
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
}

/* Hide / Show N files — absent entirely on a card small enough not to need folding */
const Fold = ({
  files,
  open,
  onToggle
}: {
  files: ManifestFile[]
  open: boolean
  onToggle: () => void
}) =>
  foldable(files) ? (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className='rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600'>
      {open ? 'Hide' : `Show ${files.length} files`}
    </button>
  ) : null

/* the first few thumbnails of a folded card, so a file can leave it without opening it */
const Peek = ({
  files,
  onDragFile
}: {
  files: ManifestFile[]
  onDragFile: WallHooks['onDragFile']
}) => (
  <div className='mt-2 flex gap-1 overflow-hidden'>
    {files.slice(0, 4).map((file, index) => (
      <img
        key={`${index}:${file.path}`}
        src={getThumbUrl(file.path, 0.5, 80)}
        alt=''
        loading='lazy'
        draggable
        onDragStart={(e) => onDragFile(file, e)}
        className='h-8 w-11 rounded bg-gray-100 object-cover'
      />
    ))}
  </div>
)

/* one wall of thumbnails; `lane` is the run a shift-click range covers */
const Wall = ({
  files,
  lane,
  onPreview,
  split,
  picked,
  onFile,
  onDragFile
}: WallHooks & {
  files: ManifestFile[]
  lane: ManifestFile[]
  onPreview: (file: ManifestFile) => void
  split?: boolean
}) => {
  const strip = (list: ManifestFile[], small?: boolean) => (
    <div className='mt-1 flex flex-wrap gap-1'>
      {list.map((file, index) => (
        <Thumb
          key={`${index}:${file.path}`}
          file={file}
          small={small}
          selected={!!file.id && picked.includes(file.id)}
          picking={picked.length > 0}
          onClick={(e) => onFile(file, lane, e, () => onPreview(file))}
          onDragStart={(e) => onDragFile(file, e)}
        />
      ))}
    </div>
  )
  if (!split) return strip(files)
  const videos = videosOf(files)
  const photos = photosOf(files)
  return (
    <div className='space-y-3'>
      {videos.length > 0 && (
        <div>
          <p className={CAPTION}>
            {videos.length} video{videos.length > 1 ? 's' : ''}
          </p>
          {strip(videos)}
        </div>
      )}
      {photos.length > 0 && (
        <div>
          <p className={CAPTION}>
            {photos.length} photo{photos.length > 1 ? 's' : ''}
          </p>
          {strip(photos, true)}
        </div>
      )}
    </div>
  )
}

const Board = ({ loaderData }: Route.ComponentProps) => {
  const { groups, setGroups, updateGroups } = useGroups(loaderData.groups)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string[]>([])
  const [draggedFiles, setDraggedFiles] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [pickedFiles, setPickedFiles] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [toggled, setToggled] = useState<string[]>([])
  const [overTarget, setOverTarget] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  /* which tandem's name is being typed — a named passenger reads as a title, not a form */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [loose, setLoose] = useState<ManifestFile[]>(loaderData.looseFiles)
  const [newPlace, setNewPlace] = useState('')
  const [places, setPlaces] = useState<Destination[]>(loaderData.destinations)
  const fetcher = useSafeFetcher()
  const preview = usePreview(groups, [], updateGroups)

  /* the server answers with the groups it saved, or with the reason it refused */
  useEffect(() => {
    if (!fetcher.data) return
    const answered = z
      .object({
        groups: z.array(manifestGroupSchema),
        looseFiles: z.array(manifestFileSchema).optional()
      })
      .safeParse(fetcher.data)
    if (answered.success) {
      const { groups: saved, looseFiles } = answered.data
      queueMicrotask(() => {
        setGroups(saved)
        if (looseFiles) setLoose(looseFiles)
        setBusy(null)
        setNote(null)
      })
      return
    }
    const refused = z
      .object({ success: z.literal(false), globalErrors: z.array(z.string()).optional() })
      .passthrough()
      .safeParse(fetcher.data)
    queueMicrotask(() => {
      setBusy(null)
      if (refused.success) setNote(refused.data.globalErrors?.[0] ?? 'Request failed')
    })
  }, [fetcher.data, setGroups])

  const unsorted = groups.filter((g) => !g.destination)
  const locations = places.filter((d) => d.name !== TANDEMS)
  const tandems = groups.filter(isTandem)
  /* a loose file that carries a destination is shown inside that card, not in the sorting area —
     it is a real lone file destined for that folder (§13.1), not something still to sort */
  const sorting = loose.filter((f) => !f.destination)
  const looseIn = (destination: string) => loose.filter((f) => f.destination === destination)
  /* the sorting area is read a shooting day at a time, newest first, like the location cards */
  const sortDays = [...new Set([...unsorted.map(dayOf), ...sorting.map(dayOfFile)])]
    .sort()
    .reverse()

  const saveDestinations = (next: Destination[]) => {
    setPlaces(next)
    fetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'save-groups', groups, destinations: next }
    })
  }

  const addPlace = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || places.some((d) => d.name === trimmed)) return
    saveDestinations([...places, { name: trimmed }])
    setNewPlace('')
  }

  const assign = (ids: string[], destination: string | null) => {
    if (destination && !places.some((d) => d.name === destination)) {
      saveDestinations([...places, { name: destination }])
    }
    const next = groups.map((g) =>
      ids.includes(g.id)
        ? {
            ...g,
            destination: destination ?? undefined,
            passenger: destination === TANDEMS ? (g.passenger ?? undefined) : undefined
          }
        : g
    )
    setPicked([])
    updateGroups(next)
  }

  const setPassenger = (groupId: string, firstname: string, lastname: string) => {
    const next = groups.map((g) =>
      g.id === groupId
        ? { ...g, passenger: firstname || lastname ? { firstname, lastname } : undefined }
        : g
    )
    updateGroups(next)
  }

  const run = (
    label: string,
    args: {
      groupId?: string
      groupIds?: string[]
      destination?: string
      intent: 'process' | 'upload-group'
    }
  ) => {
    setNote(null)
    setBusy(label)
    fetcher.submit({ url: '/api/manifest', actionArgs: args })
  }

  const createMontage = async (group: ManifestGroup) => {
    setBusy(group.id)
    setNote(null)
    try {
      const res = await fetch(`/api/create-montage?groupId=${encodeURIComponent(group.id)}`)
      const data = montageResponseSchema.safeParse(await res.json())
      if (!data.success) setNote('Montage: unexpected answer from the server')
      else if (data.data.error) setNote(`Montage: ${data.data.error}`)
      else setNote(`Montage ready — ${data.data.clips ?? 0} clips in ${data.data.projectPath}`)
    } catch (e) {
      setNote(`Montage failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const openPreview = (group: ManifestGroup, file: ManifestFile) =>
    preview.handlePreview(file, group.id)

  /* two jumps that turn out to be one: the server merges them and answers with the saved list */
  const mergeTwo = (leftId: string, rightId: string, anchorEpoch: number) => {
    setComparing(false)
    setPicked([])
    setNote(null)
    setBusy('merge')
    fetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'merge-groups', leftId, rightId, anchorEpoch }
    })
  }

  /* files leave their jump and are re-filed server-side, so the answer is the truth.
     `newGroup` gathers them into a jump of their own — what a tandem needs, since the passenger
     name lives on a group; without it the files would land as lone files and fall back to the
     sorting area, which is not what dropping them on Tandems means. */
  const moveFiles = (ids: string[], destination: string | null, newGroup?: boolean) => {
    if (ids.length === 0) return
    setNote(null)
    setBusy('move')
    setPickedFiles([])
    setAnchor(null)
    fetcher.submit({
      url: '/api/manifest',
      actionArgs: {
        intent: 'move-files',
        fileIds: ids,
        destination: destination ?? undefined,
        ...(newGroup ? { newGroup: true } : {})
      }
    })
  }

  /* plain click previews while nothing is picked, and extends the picking once it started */
  const clickFile = (
    file: ManifestFile,
    lane: ManifestFile[],
    e: React.MouseEvent,
    onPreview: () => void
  ) => {
    const id = file.id
    if (!id) {
      onPreview()
      return
    }
    const ids = lane.flatMap((f) => (f.id ? [f.id] : []))
    if (e.shiftKey && anchor && ids.includes(anchor)) {
      const from = ids.indexOf(anchor)
      const to = ids.indexOf(id)
      const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1)
      setPickedFiles([...new Set([...pickedFiles, ...range])])
      return
    }
    if (e.ctrlKey || e.metaKey || pickedFiles.length > 0) {
      setPickedFiles(
        pickedFiles.includes(id) ? pickedFiles.filter((x) => x !== id) : [...pickedFiles, id]
      )
      setAnchor(id)
      return
    }
    setAnchor(id)
    onPreview()
  }

  const clearFiles = () => {
    setPickedFiles([])
    setAnchor(null)
  }

  const isOpen = (key: string, files: ManifestFile[]) =>
    toggled.includes(key) ? foldable(files) : !foldable(files)

  const toggle = (key: string) =>
    setToggled(toggled.includes(key) ? toggled.filter((k) => k !== key) : [...toggled, key])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      /* never steal Delete or Backspace from the passenger name fields */
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      /* while comparing, Escape closes the dialog and nothing else reaches the board */
      if (comparing) {
        if (e.key === 'Escape') queueMicrotask(() => setComparing(false))
        return
      }
      if (e.key === 'Escape') {
        queueMicrotask(clearFiles)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (pickedFiles.length === 0) return
      e.preventDefault()
      queueMicrotask(() => moveFiles(pickedFiles, null))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const startFileDrag = (file: ManifestFile, e?: React.DragEvent) => {
    if (!file.id) return
    /* a thumbnail sits inside a draggable jump card — only the file must travel */
    e?.stopPropagation()
    setDragged([])
    setDraggedFiles(pickedFiles.includes(file.id) ? pickedFiles : [file.id])
  }

  /* every wall of thumbnails needs the same three things from the board */
  const wall = { picked: pickedFiles, onFile: clickFile, onDragFile: startFileDrag }

  /* Only the zone under the pointer lights up, and only when it takes what is being carried.
     onDragLeave also fires when the pointer crosses a child, so `contains` stops the flicker. */
  const leaveTarget = (key: string) => (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setOverTarget((current) => (current === key ? null : current))
  }

  /* a jump card accepts files dropped from anywhere, so a photo can change jump */
  const groupDropTarget = (groupId: string) => {
    const key = `group:${groupId}`
    return {
      onDragOver: (e: React.DragEvent) => {
        if (draggedFiles.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        setOverTarget(key)
      },
      onDragLeave: leaveTarget(key),
      onDrop: (e: React.DragEvent) => {
        setOverTarget(null)
        if (draggedFiles.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        setNote(null)
        setBusy('move')
        setPickedFiles([])
        setAnchor(null)
        fetcher.submit({
          url: '/api/manifest',
          actionArgs: { intent: 'move-files', fileIds: draggedFiles, targetGroupId: groupId }
        })
        setDraggedFiles([])
      }
    }
  }

  const dropTarget = (destination: string | null) => {
    const key = destination === null ? 'sort' : `dest:${destination}`
    /* the sorting area takes files back; a destination card takes whole jumps as well */
    const accepts =
      destination === null ? draggedFiles.length > 0 : dragged.length > 0 || draggedFiles.length > 0
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts) return
        e.preventDefault()
        setOverTarget(key)
      },
      onDragLeave: leaveTarget(key),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        setOverTarget(null)
        if (draggedFiles.length > 0) moveFiles(draggedFiles, destination, destination === TANDEMS)
        else if (dragged.length > 0) assign(dragged, destination)
        setDragged([])
        setDraggedFiles([])
      }
    }
  }

  if (!loaderData.hasManifest) {
    return (
      <main className='mx-auto max-w-5xl p-6'>
        <h1 className='text-xl font-semibold'>No manifest found</h1>
        <p className='mt-2 text-sm text-gray-600'>
          Copy the cameras, then run a scan from the{' '}
          <a
            href='/classic'
            className='underline'>
            classic view
          </a>
          .
        </p>
      </main>
    )
  }

  return (
    <main
      /* dragend bubbles, so one handler clears the highlight however a drag ends */
      onDragEnd={() => {
        setOverTarget(null)
        setDraggedFiles([])
        setDragged([])
      }}
      className='mx-auto max-w-[1700px] p-4'>
      <header className='flex flex-wrap items-center gap-3 border-b border-gray-200 pb-3'>
        <span className='text-base font-bold'>
          Sky<span className='text-teal-700'>Dock</span>
        </span>
        <span className='text-sm text-gray-500'>
          {groups.length} jumps · {groups.reduce((n, g) => n + g.files.length, 0)} files ·{' '}
          {unsorted.length} to sort
        </span>
        <a
          href='/classic'
          className='ml-auto text-sm text-gray-500 underline'>
          classic view (scan, NAS, calibration)
        </a>
      </header>

      {note && (
        <p className='mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900'>{note}</p>
      )}

      {/* two panes that scroll on their own: what is left to sort on the left, where it goes on
          the right, so a jump never has to be dragged across a scrolling page */}
      <div className='mt-4 grid gap-4 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-2'>
        <div className='pb-24 lg:h-full lg:overflow-y-auto lg:pr-1 lg:pb-4'>
          <section
            {...dropTarget(null)}
            className={`rounded-xl border bg-white p-4 ${
              overTarget === 'sort' ? 'border-dashed border-teal-500' : 'border-gray-200'
            }`}>
            <div className='flex flex-wrap items-baseline gap-3'>
              <h2 className='text-sm font-semibold'>To sort</h2>
              <span className='text-xs text-gray-500'>
                {sortDays.length > 0
                  ? 'drag a jump onto a card on the right, or tick a few and use the buttons'
                  : 'nothing left'}
              </span>
              {sorting.length > 0 && (
                <button
                  type='button'
                  disabled={busy !== null}
                  onClick={() => {
                    setNote(null)
                    setBusy('regroup')
                    fetcher.submit({
                      url: '/api/manifest',
                      actionArgs: { intent: 'regroup-loose' }
                    })
                  }}
                  title='Cluster every loose file back into jumps by capture time, like the scan does'
                  className='rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold disabled:opacity-50'>
                  {busy === 'regroup' ? 'Regrouping…' : `Regroup ${sorting.length} loose`}
                </button>
              )}
              <span className='ml-auto text-xs text-gray-500'>
                Files: click to preview · ⌘/ctrl-click to pick · shift-click for a range
              </span>
            </div>
            {sortDays.map((day) => {
              const dayGroups = byMin(unsorted.filter((g) => dayOf(g) === day))
              const dayLoose = byMtime(sorting.filter((f) => dayOfFile(f) === day))
              const dayFiles = dayGroups.reduce((n, g) => n + g.files.length, 0) + dayLoose.length
              return (
                <div
                  key={day}
                  className='mt-4'>
                  {/* the day stays on screen while its jumps scroll past, so a card is never
                      read against the wrong date */}
                  <div className='sticky top-0 z-10 -mx-4 flex flex-wrap items-baseline gap-2 border-b border-gray-100 bg-white px-4 py-1'>
                    <b className='text-xs'>{dayLabel(day)}</b>
                    <span className='text-xs text-gray-500'>
                      {dayGroups.length > 0 &&
                        `${dayGroups.length} jump${dayGroups.length > 1 ? 's' : ''} · `}
                      {dayFiles} file{dayFiles > 1 ? 's' : ''}
                      {dayLoose.length > 0 && ` · ${dayLoose.length} loose`}
                    </span>
                  </div>
                  <div className='mt-2 space-y-2'>
                    {dayGroups.map((group) => {
                      const open = isOpen(group.id, group.files)
                      const videos = videosOf(group.files)
                      const photos = photosOf(group.files)
                      const dragJump = () =>
                        setDragged(picked.includes(group.id) ? picked : [group.id])
                      return (
                        <div
                          key={group.id}
                          draggable={!open}
                          onDragStart={dragJump}
                          onDragEnd={() => {
                            setDragged([])
                            setOverTarget(null)
                          }}
                          {...groupDropTarget(group.id)}
                          className={`rounded-lg border p-2 ${open ? '' : 'cursor-grab'} ${
                            overTarget === `group:${group.id}`
                              ? 'border-dashed border-teal-500'
                              : picked.includes(group.id)
                                ? 'border-teal-600 bg-teal-50'
                                : 'border-gray-200'
                          }`}>
                          <div
                            onClick={() => {
                              if (foldable(group.files)) toggle(group.id)
                            }}
                            className={`flex items-center gap-2 text-sm ${
                              foldable(group.files) ? 'cursor-pointer' : ''
                            }`}>
                            <input
                              type='checkbox'
                              checked={picked.includes(group.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() =>
                                setPicked(
                                  picked.includes(group.id)
                                    ? picked.filter((id) => id !== group.id)
                                    : [...picked, group.id]
                                )
                              }
                            />
                            {/* an open card is not draggable by its body — this handle is, so a jump can
                          be filed without folding it first */}
                            <span
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation()
                                dragJump()
                              }}
                              onClick={(e) => e.stopPropagation()}
                              title='Drag this jump onto a card on the right'
                              className='cursor-grab px-1 text-gray-400 select-none'>
                              ≡
                            </span>
                            <span className='font-mono'>
                              {formatTime(minFileMtime(group.files) ?? 0)}
                            </span>
                            <span className='truncate text-xs whitespace-nowrap text-gray-500'>
                              {videos.length > 0 &&
                                `${videos.length} video${videos.length > 1 ? 's' : ''}`}
                              {videos.length > 0 && photos.length > 0 && ' · '}
                              {photos.length > 0 &&
                                `${photos.length} photo${photos.length > 1 ? 's' : ''}`}
                            </span>
                            <span className='ml-auto'>
                              <Fold
                                files={group.files}
                                open={open}
                                onToggle={() => toggle(group.id)}
                              />
                            </span>
                          </div>
                          {open ? (
                            <div className='mt-2'>
                              <Wall
                                {...wall}
                                files={group.files}
                                lane={group.files}
                                split
                                onPreview={(file) => openPreview(group, file)}
                              />
                            </div>
                          ) : (
                            <Peek
                              files={group.files}
                              onDragFile={startFileDrag}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {dayLoose.length > 0 && (
                    <div className='mt-2 rounded-lg border border-dashed border-gray-200 p-2'>
                      <p className='text-xs text-gray-500'>
                        {dayLoose.length} loose file{dayLoose.length > 1 ? 's' : ''} — in no jump
                      </p>
                      <Wall
                        {...wall}
                        files={dayLoose}
                        lane={dayLoose}
                        onPreview={(file) => preview.handlePreview(file, 'loose')}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {picked.length > 0 && (
              /* sticks to the foot of the pane: the ticked jumps can be anywhere in a long
                 column, and a bar that scrolled away with them was a bar nobody found */
              <div className='sticky bottom-0 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-900 p-2 text-sm text-white shadow-lg'>
                <b className='px-1'>{picked.length} selected</b>
                <button
                  type='button'
                  disabled={picked.length !== 2}
                  onClick={() => setComparing(true)}
                  title={
                    picked.length === 2
                      ? 'Look at both jumps side by side, and merge them if they are one'
                      : 'Compare works on exactly two jumps — tick two'
                  }
                  className='rounded bg-white px-3 py-1 font-semibold text-gray-900 disabled:opacity-40'>
                  {picked.length === 2 ? 'Compare' : `Compare (${picked.length}/2)`}
                </button>
                <span className='opacity-70'>set all to</span>
                {locations.map((d) => (
                  <button
                    key={d.name}
                    type='button'
                    onClick={() => assign(picked, d.name)}
                    className='rounded bg-white/15 px-3 py-1'>
                    {d.name}
                  </button>
                ))}
                <button
                  type='button'
                  onClick={() => assign(picked, TANDEMS)}
                  className='rounded bg-white/15 px-3 py-1'>
                  {TANDEMS}
                </button>
                <button
                  type='button'
                  onClick={() => setPicked([])}
                  className='ml-auto underline'>
                  clear
                </button>
              </div>
            )}
          </section>
        </div>

        <div className='pb-24 lg:h-full lg:overflow-y-auto lg:pr-1 lg:pb-4'>
          <div className='flex flex-wrap items-center gap-3'>
            <h2 className='text-xs font-semibold tracking-widest text-gray-500 uppercase'>
              Fun jumps · one folder per dropzone
            </h2>
            <span className='flex items-center gap-2'>
              <input
                type='text'
                value={newPlace}
                placeholder='New location'
                onChange={(e) => setNewPlace(e.target.value)}
                className='w-36 rounded border border-gray-300 px-2 py-1 text-sm'
              />
              <button
                type='button'
                onClick={() => addPlace(newPlace)}
                className='rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold'>
                Add
              </button>
            </span>
          </div>
          <div className='mt-2 grid gap-4 2xl:grid-cols-2'>
            {locations.map((destination) => {
              const inside = groups.filter((g) => g.destination === destination.name)
              const lone = looseIn(destination.name)
              const days = [...new Set([...inside.map(dayOf), ...lone.map(dayOfFile)])]
                .sort()
                .reverse()
              return (
                <section
                  key={destination.name}
                  {...dropTarget(destination.name)}
                  className={`rounded-xl border bg-white p-4 ${
                    overTarget === `dest:${destination.name}`
                      ? 'border-dashed border-teal-500'
                      : 'border-gray-200'
                  }`}>
                  <div className='flex items-baseline gap-2'>
                    <h3 className='font-semibold'>{destination.name}</h3>
                    <span className='ml-auto text-xs text-gray-500'>
                      {inside.reduce((n, g) => n + g.files.length, 0) + lone.length} files
                    </span>
                  </div>
                  <p className='mt-1 font-mono text-[11px] text-gray-400'>
                    processed/{destination.name}/ · every file lands here directly
                  </p>
                  {days.length === 0 && (
                    <p className='mt-3 text-xs text-gray-400'>Drag jumps or files here.</p>
                  )}
                  {days.map((day) => {
                    const dayGroups = inside.filter((g) => dayOf(g) === day)
                    const dayLone = lone.filter((f) => dayOfFile(f) === day)
                    /* a day row mixes whole jumps and lone files — on disk they are the same
                       flat folder (§13.1), so they are drawn as one run of thumbnails */
                    const files = byMtime([...dayGroups.flatMap((g) => g.files), ...dayLone])
                    const owner = new Map(
                      dayGroups.flatMap((g) => g.files.map((f) => [f.path, g] as const))
                    )
                    const key = `${destination.name}:${day}`
                    const pending =
                      dayGroups.some((g) => !g.processed) || dayLone.some((f) => !f.processedPath)
                    return (
                      <div
                        key={day}
                        className='mt-3 border-t border-gray-100 pt-3'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <b className='text-xs'>{dayLabel(day)}</b>
                          <span className='text-xs text-gray-500'>
                            {files.length} file{files.length > 1 ? 's' : ''}
                            {dayLone.length > 0 && ` · ${dayLone.length} lone`}
                          </span>
                          <Fold
                            files={files}
                            open={isOpen(key, files)}
                            onToggle={() => toggle(key)}
                          />
                          {pending ? (
                            <button
                              type='button'
                              disabled={busy !== null}
                              /* lone files belong to no group, so a day holding any of them is
                                 processed by destination scope instead of by group ids (§6.1) */
                              onClick={() =>
                                run(
                                  key,
                                  dayLone.length > 0
                                    ? { intent: 'process', destination: destination.name }
                                    : {
                                        intent: 'process',
                                        groupIds: dayGroups.map((g) => g.id)
                                      }
                                )
                              }
                              className='ml-auto rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                              {busy === key ? 'Processing…' : 'Process'}
                            </button>
                          ) : (
                            <span className='ml-auto text-xs text-green-700'>✓ processed</span>
                          )}
                        </div>
                        {isOpen(key, files) ? (
                          <Wall
                            {...wall}
                            files={files}
                            lane={files}
                            onPreview={(file) => {
                              const group = owner.get(file.path)
                              if (group) openPreview(group, file)
                              else preview.handlePreview(file, 'loose')
                            }}
                          />
                        ) : (
                          <Peek
                            files={files}
                            onDragFile={startFileDrag}
                          />
                        )}
                      </div>
                    )
                  })}
                </section>
              )
            })}
          </div>

          <h2 className='mt-6 text-xs font-semibold tracking-widest text-gray-500 uppercase'>
            Tandems · one folder per passenger
          </h2>
          <section
            {...dropTarget(TANDEMS)}
            className={`mt-2 rounded-xl border bg-gray-50 p-4 ${
              overTarget === `dest:${TANDEMS}` ? 'border-dashed border-teal-500' : 'border-gray-200'
            }`}>
            <p className='font-mono text-[11px] text-gray-400'>
              processed/Tandems/{'{passenger}'}/ · videos/ + photos/ · film + photos.zip for the
              passenger, rushes.zip for the backup
            </p>
            {tandems.length === 0 && looseIn(TANDEMS).length === 0 && (
              <p className='mt-3 text-xs text-gray-400'>
                Drag tandem jumps here — or files, which become a tandem of their own.
              </p>
            )}
            {/* files filed to Tandems that belong to no passenger yet — they cannot be processed
                as they are, since the folder is named after the passenger, so they are shown
                here with the one button that fixes them rather than left invisible */}
            {looseIn(TANDEMS).length > 0 &&
              (() => {
                const stray = looseIn(TANDEMS)
                const key = 'tandems:stray'
                return (
                  <div className='mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <b className='text-xs text-amber-900'>
                        {stray.length} file{stray.length > 1 ? 's' : ''} with no passenger yet
                      </b>
                      <button
                        type='button'
                        disabled={busy !== null}
                        onClick={() =>
                          moveFiles(
                            stray.flatMap((f) => (f.id ? [f.id] : [])),
                            TANDEMS,
                            true
                          )
                        }
                        className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                        Make them a tandem
                      </button>
                      <span className='ml-auto flex items-center gap-2'>
                        <Fold
                          files={stray}
                          open={isOpen(key, stray)}
                          onToggle={() => toggle(key)}
                        />
                      </span>
                    </div>
                    {isOpen(key, stray) ? (
                      <Wall
                        {...wall}
                        files={stray}
                        lane={stray}
                        onPreview={(file) => preview.handlePreview(file, 'loose')}
                      />
                    ) : (
                      <Peek
                        files={stray}
                        onDragFile={startFileDrag}
                      />
                    )}
                  </div>
                )
              })()}
            {tandems.map((group) => (
              <div
                key={group.id}
                /* each passenger row takes files of its own, so a shot filmed on the wrong
                   jump joins the right tandem instead of starting a new one */
                {...groupDropTarget(group.id)}
                className={`mt-3 rounded-lg border bg-white p-3 ${
                  overTarget === `group:${group.id}`
                    ? 'border-dashed border-teal-500'
                    : 'border-gray-200'
                }`}>
                <div className='flex flex-wrap items-center gap-2'>
                  {/* a named passenger is the card's title and only turns back into a form when
                      clicked — two permanent input boxes read as an unfinished form and gave no
                      sign that the name had been saved */}
                  {renaming === group.id || !passengerName(group) ? (
                    <span className='flex flex-wrap items-center gap-2'>
                      <input
                        type='text'
                        autoFocus={renaming === group.id}
                        defaultValue={group.passenger?.firstname ?? ''}
                        placeholder='First name'
                        onBlur={(e) =>
                          setPassenger(
                            group.id,
                            e.target.value.trim(),
                            group.passenger?.lastname ?? ''
                          )
                        }
                        className='w-28 rounded border border-gray-300 px-2 py-1 text-sm'
                      />
                      <input
                        type='text'
                        defaultValue={group.passenger?.lastname ?? ''}
                        placeholder='Last name'
                        onBlur={(e) =>
                          setPassenger(
                            group.id,
                            group.passenger?.firstname ?? '',
                            e.target.value.trim()
                          )
                        }
                        className='w-28 rounded border border-gray-300 px-2 py-1 text-sm'
                      />
                      {renaming === group.id && (
                        <button
                          type='button'
                          onClick={() => setRenaming(null)}
                          className='rounded bg-gray-900 px-3 py-1 text-xs font-semibold text-white'>
                          Done
                        </button>
                      )}
                    </span>
                  ) : (
                    <button
                      type='button'
                      onClick={() => setRenaming(group.id)}
                      title='Click to change the passenger name'
                      className='rounded px-1 text-base font-semibold text-gray-900 hover:bg-gray-100'>
                      {passengerName(group)} <span className='text-xs text-gray-400'>✎</span>
                    </button>
                  )}
                  <span className='font-mono text-xs text-gray-500'>
                    {formatTime(minFileMtime(group.files) ?? 0)}
                  </span>
                  <span className='text-xs text-gray-500'>{group.files.length} files</span>
                  {!passengerName(group) && (
                    <span className='text-xs text-amber-700'>name needed before processing</span>
                  )}
                  <Fold
                    files={group.files}
                    open={isOpen(group.id, group.files)}
                    onToggle={() => toggle(group.id)}
                  />
                  <span className='ml-auto flex items-center gap-2'>
                    {!group.processed && (
                      <button
                        type='button'
                        disabled={busy !== null || !passengerName(group)}
                        onClick={() => run(group.id, { intent: 'process', groupId: group.id })}
                        className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                        {busy === group.id ? 'Processing…' : 'Process'}
                      </button>
                    )}
                    {group.processed && (
                      <>
                        <button
                          type='button'
                          disabled={busy !== null}
                          onClick={() => createMontage(group)}
                          className='rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold disabled:opacity-50'>
                          Montage
                        </button>
                        <button
                          type='button'
                          disabled={busy !== null || !loaderData.nas.connected}
                          title={
                            loaderData.nas.connected
                              ? 'Send to the NAS'
                              : 'Connect the NAS from the classic view first'
                          }
                          onClick={() =>
                            run(group.id, { intent: 'upload-group', groupId: group.id })
                          }
                          className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                          Upload
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {isOpen(group.id, group.files) ? (
                  <div className='mt-2'>
                    <Wall
                      {...wall}
                      files={group.files}
                      lane={group.files}
                      split
                      onPreview={(file) => openPreview(group, file)}
                    />
                  </div>
                ) : (
                  <Peek
                    files={group.files}
                    onDragFile={startFileDrag}
                  />
                )}
              </div>
            ))}
          </section>
        </div>
      </div>

      {pickedFiles.length > 0 && (
        <div className='fixed inset-x-0 bottom-0 z-40 border-t border-gray-700 bg-gray-900 p-3 text-sm text-white'>
          <div className='mx-auto flex max-w-[1700px] flex-wrap items-center gap-3'>
            <b>
              {pickedFiles.length} file{pickedFiles.length > 1 ? 's' : ''} selected
            </b>
            <button
              type='button'
              disabled={busy !== null}
              onClick={() => moveFiles(pickedFiles, null)}
              className='rounded bg-teal-600 px-3 py-1 font-semibold disabled:opacity-40'>
              Remove — back to sorting
            </button>
            <span className='text-xs opacity-60'>
              or drag them onto another card · ⌘/ctrl-click to add · shift-click for a range ·
              Delete removes
            </span>
            <button
              type='button'
              onClick={clearFiles}
              className='ml-auto rounded bg-white px-3 py-1 font-semibold text-gray-900'>
              Done
            </button>
          </div>
        </div>
      )}

      {comparing && picked.length === 2 && (
        <ComparisonDialog
          groups={groups}
          leftGroupId={picked[0]}
          rightGroupId={picked[1]}
          onClose={() => setComparing(false)}
          onMerge={mergeTwo}
        />
      )}

      {preview.preview && preview.preview.files[preview.preview.index] && (
        <PreviewDrawer
          files={preview.preview.files}
          index={preview.preview.index}
          onClose={preview.closePreview}
          onPrevious={() =>
            preview.setPreview((p) => (p ? { ...p, index: Math.max(0, p.index - 1) } : p))
          }
          onNext={() =>
            preview.setPreview((p) =>
              p ? { ...p, index: Math.min(p.files.length - 1, p.index + 1) } : p
            )
          }
          cropStart={preview.videoState.crop.cropStart}
          cropEnd={preview.videoState.crop.cropEnd}
          zoom={preview.videoState.zoom}
          currentTime={preview.videoState.currentTime}
          duration={preview.videoState.duration}
          onSeek={preview.handleVideoSeek}
          onCropChange={(crop) => preview.setVideoState({ crop })}
          onApply={preview.handleVideoApply}
          onZoomChange={(zoom) => preview.setVideoState({ zoom })}
          onDurationChange={(duration) => preview.setVideoState({ duration })}
          onVideoRef={preview.handleVideoRef}
        />
      )}
    </main>
  )
}

export { loader }

export default Board
