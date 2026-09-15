import { loadManifest, loadNasSession, manifestGroupSchema } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { PreviewDrawer } from '../components/preview-drawer'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import {
  formatSize,
  formatTime,
  getFileUrl,
  getThumbUrl,
  isVideoFile,
  minFileMtime
} from '../components/utils'
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
  return {
    groups: manifest?.groups ?? [],
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
const kept = (group: ManifestGroup) => group.files.filter((f) => f.keep !== false)

const Thumb = ({
  file,
  removed,
  onOpen,
  onToggle
}: {
  file: ManifestFile
  removed: boolean
  onOpen: () => void
  onToggle: () => void
}) => (
  <div className={`relative ${removed ? 'opacity-35 grayscale' : ''}`}>
    <button
      type='button'
      onClick={onOpen}
      title={`${file.filename} · ${formatTime(file.mtime)} · ${formatSize(file.size)}`}
      className='block h-12 w-16 overflow-hidden rounded border border-gray-200 bg-gray-100'>
      <img
        src={isVideoFile(file.path) ? getThumbUrl(file.path, 0.5, 120) : getFileUrl(file.path)}
        alt={file.filename}
        loading='lazy'
        className='h-full w-full object-cover'
      />
    </button>
    <button
      type='button'
      onClick={onToggle}
      title={removed ? 'Put it back' : 'Remove it from this jump'}
      className='absolute -top-1 -right-1 h-5 w-5 rounded-full border border-gray-300 bg-white text-[10px] leading-none text-gray-600 hover:border-red-400 hover:text-red-600'>
      {removed ? '↺' : '✕'}
    </button>
  </div>
)

const Board = ({ loaderData }: Route.ComponentProps) => {
  const { groups, setGroups, updateGroups } = useGroups(loaderData.groups)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [newPlace, setNewPlace] = useState('')
  const [places, setPlaces] = useState<Destination[]>(loaderData.destinations)
  const fetcher = useSafeFetcher()
  const preview = usePreview(groups, [], updateGroups)

  /* the server answers with the groups it saved, or with the reason it refused */
  useEffect(() => {
    if (!fetcher.data) return
    const answered = z.object({ groups: z.array(manifestGroupSchema) }).safeParse(fetcher.data)
    if (answered.success) {
      queueMicrotask(() => {
        setGroups(answered.data.groups)
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

  const toggleKeep = (groupId: string, fileId: string | undefined, path: string) => {
    const next = groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            files: g.files.map((f) =>
              (f.id && f.id === fileId) || f.path === path ? { ...f, keep: f.keep === false } : f
            )
          }
        : g
    )
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

  const dropTarget = (destination: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragged.length > 0) e.preventDefault()
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragged.length > 0) assign(dragged, destination)
      setDragged([])
    }
  })

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
    <main className='mx-auto max-w-6xl p-4 pb-24'>
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

      <section className='mt-4 rounded-xl border border-gray-200 bg-white p-4'>
        <div className='flex flex-wrap items-baseline gap-3'>
          <h2 className='text-sm font-semibold'>To sort</h2>
          <span className='text-xs text-gray-500'>
            {unsorted.length > 0
              ? 'drag a jump onto a location below, or pick a few and use the buttons'
              : 'nothing left'}
          </span>
        </div>
        <div className='mt-3 flex flex-wrap gap-2'>
          {unsorted.map((group) => (
            <div
              key={group.id}
              draggable
              onDragStart={() => setDragged(picked.includes(group.id) ? picked : [group.id])}
              onDragEnd={() => setDragged([])}
              className={`w-52 cursor-grab rounded-lg border p-2 ${
                picked.includes(group.id) ? 'border-teal-600 bg-teal-50' : 'border-gray-200'
              }`}>
              <label className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={picked.includes(group.id)}
                  onChange={() =>
                    setPicked(
                      picked.includes(group.id)
                        ? picked.filter((id) => id !== group.id)
                        : [...picked, group.id]
                    )
                  }
                />
                <span className='font-mono'>{formatTime(minFileMtime(group.files) ?? 0)}</span>
                <span className='ml-auto text-xs text-gray-500'>{group.files.length} files</span>
              </label>
              <div className='mt-2 flex gap-1 overflow-hidden'>
                {group.files.slice(0, 4).map((file, index) => (
                  <img
                    key={`${index}:${file.path}`}
                    src={
                      isVideoFile(file.path)
                        ? getThumbUrl(file.path, 0.5, 80)
                        : getFileUrl(file.path)
                    }
                    alt={file.filename}
                    loading='lazy'
                    className='h-8 w-11 rounded object-cover'
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
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
                dragged.length > 0 ? 'border-dashed border-teal-500' : 'border-gray-200'
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
                        {dayGroups.reduce((n, g) => n + kept(g).length, 0)} files
                      </span>
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
                            removed={file.keep === false}
                            onOpen={() => openPreview(group, file)}
                            onToggle={() => toggleKeep(group.id, file.id, file.path)}
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
          dragged.length > 0 ? 'border-dashed border-teal-500' : 'border-gray-200'
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
              <span className='text-xs text-gray-500'>
                {kept(group).length} files
                {group.files.length !== kept(group).length &&
                  ` · ${group.files.length - kept(group).length} removed`}
              </span>
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
                  removed={file.keep === false}
                  onOpen={() => openPreview(group, file)}
                  onToggle={() => toggleKeep(group.id, file.id, file.path)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

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
