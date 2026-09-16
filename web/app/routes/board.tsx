import {
  loadManifest,
  loadNasSession,
  manifestFileSchema,
  manifestGroupSchema
} from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { z } from 'zod'
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
const dayOf = (group: ManifestGroup) => {
  const min = minFileMtime(group.files)
  if (min === null) return group.day
  const d = new Date(min * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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

/* A jump of ordinary size shows its files straight away — reaching one should cost no click.
   Only a card big enough to bury the page stays folded. */
const AUTO_OPEN_MAX = 40
const defaultOpen = (group: ManifestGroup) => group.files.length <= AUTO_OPEN_MAX

/* a shift-click range runs across every file shown under one day, in the order drawn */
const dayLane = (dayGroups: ManifestGroup[]) => dayGroups.flatMap((g) => g.files)

const Thumb = ({
  file,
  selected,
  selecting,
  onClick,
  onDragStart,
  small
}: {
  file: ManifestFile
  selected: boolean
  selecting: boolean
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
    {(selecting || selected) && (
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

const Board = ({ loaderData }: Route.ComponentProps) => {
  const { groups, setGroups, updateGroups } = useGroups(loaderData.groups)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string[]>([])
  const [draggedFiles, setDraggedFiles] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [pickedFiles, setPickedFiles] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [toggled, setToggled] = useState<string[]>([])
  const [overTarget, setOverTarget] = useState<string | null>(null)
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
    args: { groupId?: string; groupIds?: string[]; intent: 'process' | 'upload-group' }
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

  /* files leave their jump and are re-filed server-side, so the answer is the truth */
  const moveFiles = (ids: string[], destination: string | null) => {
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
        destination: destination ?? undefined
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
    if (selecting || e.ctrlKey || e.metaKey || pickedFiles.length > 0) {
      setPickedFiles(
        pickedFiles.includes(id) ? pickedFiles.filter((x) => x !== id) : [...pickedFiles, id]
      )
      setAnchor(id)
      return
    }
    setAnchor(id)
    onPreview()
  }

  const stopSelecting = () => {
    setSelecting(false)
    setPickedFiles([])
    setAnchor(null)
  }

  /* one button turns picking on, so it never depends on knowing the ctrl-click trick */
  const SelectButton = ({ files }: { files: ManifestFile[] }) => {
    const ids = files.flatMap((f) => (f.id ? [f.id] : []))
    const allPicked = ids.length > 0 && ids.every((id) => pickedFiles.includes(id))
    if (!selecting) {
      return (
        <button
          type='button'
          onClick={() => setSelecting(true)}
          className='rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600'>
          Select
        </button>
      )
    }
    return (
      <button
        type='button'
        onClick={() =>
          setPickedFiles(
            allPicked
              ? pickedFiles.filter((id) => !ids.includes(id))
              : [...new Set([...pickedFiles, ...ids])]
          )
        }
        className='rounded border border-teal-600 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800'>
        {allPicked ? 'None' : `All ${ids.length}`}
      </button>
    )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      /* never steal Delete or Backspace from the passenger name fields */
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      if (e.key === 'Escape') {
        queueMicrotask(() => {
          setSelecting(false)
          setPickedFiles([])
          setAnchor(null)
        })
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
        if (draggedFiles.length > 0) moveFiles(draggedFiles, destination)
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
      className='mx-auto max-w-6xl p-4 pb-24'>
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
          classic view (scan, NAS, compare)
        </a>
      </header>

      {note && (
        <p className='mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900'>{note}</p>
      )}

      <section
        {...dropTarget(null)}
        className={`mt-4 rounded-xl border bg-white p-4 ${
          overTarget === 'sort' ? 'border-dashed border-teal-500' : 'border-gray-200'
        }`}>
        <div className='flex flex-wrap items-baseline gap-3'>
          <h2 className='text-sm font-semibold'>To sort</h2>
          <span className='text-xs text-gray-500'>
            {unsorted.length > 0 || loose.length > 0
              ? 'drag a jump onto a location below, or pick a few and use the buttons'
              : 'nothing left'}
          </span>
          <span className='ml-auto text-xs text-gray-500'>
            To pick single files, use <b>Select</b> on any card below.
          </span>
        </div>
        <div className='mt-3 space-y-2'>
          {unsorted.map((group) => {
            const open = toggled.includes(group.id) ? !defaultOpen(group) : defaultOpen(group)
            const videos = videosOf(group.files)
            const photos = photosOf(group.files)
            const toggle = () =>
              setToggled(
                toggled.includes(group.id)
                  ? toggled.filter((id) => id !== group.id)
                  : [...toggled, group.id]
              )
            return (
              <div
                key={group.id}
                draggable={!open}
                onDragStart={() => setDragged(picked.includes(group.id) ? picked : [group.id])}
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
                  onClick={toggle}
                  className='flex cursor-pointer items-center gap-2 text-sm'>
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
                  <span className='font-mono'>{formatTime(minFileMtime(group.files) ?? 0)}</span>
                  <span className='truncate text-xs whitespace-nowrap text-gray-500'>
                    {videos.length > 0 && `${videos.length} video${videos.length > 1 ? 's' : ''}`}
                    {videos.length > 0 && photos.length > 0 && ' · '}
                    {photos.length > 0 && `${photos.length} photo${photos.length > 1 ? 's' : ''}`}
                  </span>
                  {open && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <SelectButton files={group.files} />
                    </span>
                  )}
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle()
                    }}
                    className='ml-auto rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600'>
                    {open
                      ? 'Hide'
                      : `Show ${group.files.length} ${photos.length > videos.length ? 'photos' : 'files'}`}
                  </button>
                </div>
                {!open && (
                  <div className='mt-2 flex gap-1 overflow-hidden'>
                    {group.files.slice(0, 4).map((file, index) => (
                      <img
                        key={`${index}:${file.path}`}
                        src={getThumbUrl(file.path, 0.5, 80)}
                        alt=''
                        loading='lazy'
                        draggable
                        onDragStart={(e) => startFileDrag(file, e)}
                        className='h-8 w-11 rounded bg-gray-100 object-cover'
                      />
                    ))}
                  </div>
                )}
                {open && (
                  <div className='mt-2 space-y-3'>
                    {videos.length > 0 && (
                      <div>
                        <p className='text-[11px] font-semibold tracking-wide text-gray-500 uppercase'>
                          {videos.length} video{videos.length > 1 ? 's' : ''}
                        </p>
                        <div className='mt-1 flex flex-wrap gap-1'>
                          {videos.map((file, index) => (
                            <Thumb
                              key={`v:${index}:${file.path}`}
                              file={file}
                              selected={!!file.id && pickedFiles.includes(file.id)}
                              selecting={selecting}
                              onClick={(e) =>
                                clickFile(file, videos, e, () => openPreview(group, file))
                              }
                              onDragStart={(e) => startFileDrag(file, e)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div>
                        <p className='text-[11px] font-semibold tracking-wide text-gray-500 uppercase'>
                          {photos.length} photo{photos.length > 1 ? 's' : ''}
                        </p>
                        <div className='mt-1 flex flex-wrap gap-1'>
                          {photos.map((file, index) => (
                            <Thumb
                              key={`p:${index}:${file.path}`}
                              file={file}
                              small
                              selected={!!file.id && pickedFiles.includes(file.id)}
                              selecting={selecting}
                              onClick={(e) =>
                                clickFile(file, photos, e, () => openPreview(group, file))
                              }
                              onDragStart={(e) => startFileDrag(file, e)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {loose.length > 0 && (
          <div className='mt-3 border-t border-gray-100 pt-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <p className='text-xs text-gray-500'>
                {loose.length} loose file{loose.length > 1 ? 's' : ''} — not in any jump. Pick them
                and file them below.
              </p>
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
                title='Cluster them back into jumps by their capture time, like the scan does'
                className='rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold disabled:opacity-50'>
                {busy === 'regroup' ? 'Regrouping…' : 'Regroup into jumps'}
              </button>
            </div>
            <div className='mt-2 flex flex-wrap gap-1'>
              {loose.map((file, index) => (
                <Thumb
                  key={`loose:${index}:${file.path}`}
                  file={file}
                  selected={!!file.id && pickedFiles.includes(file.id)}
                  selecting={selecting}
                  onClick={(e) =>
                    clickFile(file, loose, e, () => preview.handlePreview(file, 'loose'))
                  }
                  onDragStart={() => startFileDrag(file)}
                />
              ))}
            </div>
          </div>
        )}
        {picked.length > 0 && (
          <div className='mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-900 p-2 text-sm text-white'>
            <b className='px-1'>{picked.length} selected</b>
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

      <div className='mt-6 flex flex-wrap items-center gap-3'>
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
      <div className='mt-2 grid gap-4 md:grid-cols-2'>
        {locations.map((destination) => {
          const inside = groups.filter((g) => g.destination === destination.name)
          const days = [...new Set(inside.map(dayOf))].sort().reverse()
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
                  {inside.reduce((n, g) => n + g.files.length, 0)} files
                </span>
              </div>
              <p className='mt-1 font-mono text-[11px] text-gray-400'>
                processed/{destination.name}/ · every file lands here directly
              </p>
              {days.length === 0 && <p className='mt-3 text-xs text-gray-400'>Drag jumps here.</p>}
              {days.map((day) => {
                const dayGroups = inside.filter((g) => dayOf(g) === day)
                const unprocessed = dayGroups.filter((g) => !g.processed)
                return (
                  <div
                    key={day}
                    className='mt-3 border-t border-gray-100 pt-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <b className='text-xs'>{dayLabel(day)}</b>
                      <span className='text-xs text-gray-500'>
                        {dayGroups.reduce((n, g) => n + g.files.length, 0)} files
                      </span>
                      <SelectButton files={dayLane(dayGroups)} />
                      {unprocessed.length > 0 ? (
                        <button
                          type='button'
                          disabled={busy !== null}
                          onClick={() =>
                            run(day, {
                              intent: 'process',
                              groupIds: unprocessed.map((g) => g.id)
                            })
                          }
                          className='ml-auto rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                          {busy === day ? 'Processing…' : 'Process'}
                        </button>
                      ) : (
                        <span className='ml-auto text-xs text-green-700'>✓ processed</span>
                      )}
                    </div>
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {dayGroups.flatMap((group) =>
                        group.files.map((file, index) => (
                          <Thumb
                            key={`${group.id}:${index}:${file.path}`}
                            file={file}
                            selected={!!file.id && pickedFiles.includes(file.id)}
                            selecting={selecting}
                            onClick={(e) =>
                              clickFile(file, dayLane(dayGroups), e, () => openPreview(group, file))
                            }
                            onDragStart={() => startFileDrag(file)}
                          />
                        ))
                      )}
                    </div>
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
        {tandems.length === 0 && (
          <p className='mt-3 text-xs text-gray-400'>Drag tandem jumps here.</p>
        )}
        {tandems.map((group) => (
          <div
            key={group.id}
            className='mt-3 border-t border-gray-200 pt-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs'>
                {formatTime(minFileMtime(group.files) ?? 0)}
              </span>
              <input
                type='text'
                defaultValue={group.passenger?.firstname ?? ''}
                placeholder='First name'
                onBlur={(e) =>
                  setPassenger(group.id, e.target.value.trim(), group.passenger?.lastname ?? '')
                }
                className='w-28 rounded border border-gray-300 px-2 py-1 text-sm'
              />
              <input
                type='text'
                defaultValue={group.passenger?.lastname ?? ''}
                placeholder='Last name'
                onBlur={(e) =>
                  setPassenger(group.id, group.passenger?.firstname ?? '', e.target.value.trim())
                }
                className='w-28 rounded border border-gray-300 px-2 py-1 text-sm'
              />
              <span className='text-xs text-gray-500'>{group.files.length} files</span>
              <span className='ml-auto flex items-center gap-2'>
                <SelectButton files={group.files} />
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
                      onClick={() => run(group.id, { intent: 'upload-group', groupId: group.id })}
                      className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                      Upload
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className='mt-2 flex flex-wrap gap-1'>
              {group.files.map((file, index) => (
                <Thumb
                  key={`${index}:${file.path}`}
                  file={file}
                  selected={!!file.id && pickedFiles.includes(file.id)}
                  selecting={selecting}
                  onClick={(e) => clickFile(file, group.files, e, () => openPreview(group, file))}
                  onDragStart={() => startFileDrag(file)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {(selecting || pickedFiles.length > 0) && (
        <div className='fixed inset-x-0 bottom-0 z-40 border-t border-gray-700 bg-gray-900 p-3 text-sm text-white'>
          <div className='mx-auto flex max-w-6xl flex-wrap items-center gap-3'>
            <b>
              {pickedFiles.length === 0
                ? 'Click the files you want'
                : `${pickedFiles.length} file${pickedFiles.length > 1 ? 's' : ''} selected`}
            </b>
            <button
              type='button'
              disabled={busy !== null || pickedFiles.length === 0}
              onClick={() => moveFiles(pickedFiles, null)}
              className='rounded bg-teal-600 px-3 py-1 font-semibold disabled:opacity-40'>
              Remove — back to sorting
            </button>
            <span className='text-xs opacity-60'>
              or drag them onto another card · shift-click for a range
            </span>
            <button
              type='button'
              onClick={stopSelecting}
              className='ml-auto rounded bg-white px-3 py-1 font-semibold text-gray-900'>
              Done
            </button>
          </div>
        </div>
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
