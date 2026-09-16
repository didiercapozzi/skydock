import {
  destinationSchema,
  ensureNasSession,
  fileStatus,
  getOutputDir,
  listRemoteFiles,
  loadManifest,
  manifestFileSchema,
  manifestGroupSchema,
  statProcessedOutputs,
  statTandemArtifacts,
  uploadGate
} from '@skydock/scripts'
import type { FileStatus, OutputFact, RemoteListing } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { ComparisonDialog } from '../components/comparison-dialog'
import { ConnectionDialog } from '../components/connection-dialog'
import { NasFolderBrowser } from '../components/nas-folder-browser'
import { StatusChip, StatusDot, StatusLegend } from '../components/file-status'
import { PreviewDrawer } from '../components/preview-drawer'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { formatSize, formatTime, getThumbUrl, isVideoFile, minFileMtime } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'
import { setFileView, useFileView } from '../hooks/useFileView'
import type { FileView } from '../hooks/useFileView'
import { useGroups } from '../hooks/useJumps'
import { LOOSE, usePreview } from '../hooks/usePreview'
import { useUploadProgress } from '../hooks/useUploadProgress'
import type { UploadProgressState } from '../hooks/useUploadProgress'
import type { Route } from './+types/board'

const TANDEMS = 'Tandems'

const nasSuccessSchema = z.object({
  connected: z.boolean(),
  hostname: z.string().optional(),
  username: z.string().optional(),
  defaultFolder: z.string().nullish(),
  backupFolder: z.string().nullish()
})

const nasErrorSchema = z.object({ globalErrors: z.array(z.string()).optional() }).passthrough()

const remoteFilesSchema = z.union([
  z.object({
    ok: z.literal(true),
    dirs: z.array(z.string()),
    sizes: z.record(z.string(), z.number().nullable()),
    at: z.number()
  }),
  z.object({ ok: z.literal(false), reason: z.string() })
])

/* a listing plus when it was taken, so the newest of several answers wins */
type CheckedListing = RemoteListing & { at: number }

/* what a tandem's folder holds, taken fresh by the server every time it answers — the film is
   rendered outside SkyDock, so nothing else can know it has appeared */
const tandemFactSchema = z.object({
  project: z.boolean(),
  projectPath: z.string(),
  film: z.object({ size: z.number(), mtime: z.number() }).nullable(),
  baseName: z.string()
})

type TandemFacts = Record<string, z.infer<typeof tandemFactSchema>>

const scanResultSchema = z.object({
  added: z.number(),
  removed: z.number(),
  moved: z.number(),
  unchanged: z.boolean(),
  fileCount: z.number(),
  groupCount: z.number()
})

/* what a scan found, in the words the board uses for it */
/* A template that came without its music and logos still produces a project, and the holes only
   show up at the render — so they are said out loud the moment the montage is made. */
const montageNote = ({ clips, missingAssets }: { clips: number; missingAssets: string[] }) =>
  missingAssets.length === 0
    ? `Montage ready — ${clips} clip${clips === 1 ? '' : 's'} on the timeline`
    : `Montage ready — ${clips} clip${clips === 1 ? '' : 's'}, but the template is missing ${missingAssets.length} file${
        missingAssets.length === 1 ? '' : 's'
      }: ${missingAssets.join(', ')}`

const scanNote = (scan: z.infer<typeof scanResultSchema>) =>
  scan.unchanged
    ? `Scan: nothing new — ${scan.fileCount} files in ${scan.groupCount} jumps`
    : `Scan: +${scan.added} new, −${scan.removed} gone, ${scan.moved} moved — ${scan.fileCount} files in ${scan.groupCount} jumps`

const loader = async (_args: Route.LoaderArgs) => {
  const outputDir = getOutputDir()
  let manifest = null
  try {
    manifest = loadManifest(`${outputDir}/manifest.json`)
  } catch {
    manifest = null
  }
  /* a session file is not a session: ask DSM whether the id still works (and let it refresh
     itself if it does not), so the board never shows a connection that is already dead */
  let nas: {
    connected: boolean
    hostname: string | null
    defaultFolder: string | null
    backupFolder: string | null
  } = { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
  /* the first look at the NAS happens here rather than on mount: the page then arrives already
     correct, and the Refresh button re-runs the same check through /api/remote-files */
  let remote: { dirs: string[]; sizes: Record<string, number | null>; at: number } | null = null
  try {
    const session = await ensureNasSession()
    if (session) {
      nas = {
        connected: true,
        hostname: session.hostname,
        defaultFolder: session.defaultFolder ?? null,
        backupFolder: session.backupFolder ?? null
      }
      if (manifest) remote = await listRemoteFiles(manifest, session)
    }
  } catch {
    nas = { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
  }
  const grouped = new Set(
    (manifest?.groups ?? []).flatMap((g) => g.files.map((f) => f.id ?? f.path))
  )
  const looseFiles = (manifest?.files ?? []).filter((f) => !grouped.has(f.id ?? f.path))
  return {
    groups: manifest?.groups ?? [],
    looseFiles,
    destinations: manifest?.destinations ?? [],
    /* what the disk says about each processed copy — the record alone cannot know someone
       emptied processed/ (RULES, File status) */
    outputs: manifest ? statProcessedOutputs(manifest) : {},
    /* and what each tandem's folder holds: nothing tells SkyDock when the editor finishes, so a
       film is only ever noticed by looking (RULES, Delivery) */
    tandems: manifest ? statTandemArtifacts(manifest, outputDir) : {},
    remote,
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

const pad = (n: number) => String(n).padStart(2, '0')

/* local calendar day, and a label built without Intl so the server and the client agree */
const dayOfMtime = (mtime: number) => {
  const d = new Date(mtime * 1000)
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

/* what a datetime-local field wants, in the reader's own timezone */
const toLocalInput = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const fromLocalInput = (value: string) => {
  const [date, time] = value.split('T')
  const [year, month, day] = (date ?? '').split('-').map(Number)
  const [hours, minutes, seconds] = (time ?? '').split(':').map(Number)
  if (!year || !month || !day || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const at = new Date(year, month - 1, day, hours, minutes, Number.isFinite(seconds) ? seconds : 0)
  return Math.floor(at.getTime() / 1000)
}

const passengerName = (group: ManifestGroup) =>
  group.passenger ? `${group.passenger.firstname} ${group.passenger.lastname}`.trim() : ''

/* which card a jump is shown in — not the same question as whether it is a passenger's tandem,
   which needs a name and is what the server gates montage and delivery on */
const inTandemsCard = (group: ManifestGroup) => group.destination === TANDEMS
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
  status,
  onClick,
  onDragStart,
  small
}: {
  file: ManifestFile
  selected: boolean
  /* a selection is under way somewhere on the board — every thumbnail shows its mark */
  picking: boolean
  status: FileStatus
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
    {file.cropStart != null && file.cropEnd != null && (
      <span
        title={`Cropped ${file.cropStart.toFixed(1)}s → ${file.cropEnd.toFixed(1)}s`}
        className='pointer-events-none absolute right-0 bottom-0 rounded-tl bg-black/60 px-0.5 text-[9px] leading-none'>
        ✂️
      </span>
    )}
    {/* the dot rides along with the tick: a wall of unselected thumbnails stays a wall of
        pictures, and the state comes back the moment a selection makes it worth knowing */}
    {(picking || selected) && <StatusDot status={status} />}
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
  /* one function decides every file's state, so rows, dots and the Upload gate cannot disagree */
  statusOf: (file: ManifestFile) => FileStatus
  view: FileView
}

/* A jump's start time, and the way to correct it. Cameras run on their own clocks and some of them
   are wrong; setting the start moves every file in the jump by the same amount, so the order inside
   it is never disturbed (RULES, Times and dates). */
const JumpTime = ({
  start,
  disabled,
  onShift
}: {
  start: number
  disabled: boolean
  onShift: (anchorEpoch: number) => void
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null)
    return (
      <button
        type='button'
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setDraft(toLocalInput(start))
        }}
        title='Wrong camera clock? Set when this jump really started — every file in it moves with it'
        className='rounded px-1 font-mono hover:bg-gray-100 disabled:opacity-60'>
        {formatTime(start)}
      </button>
    )
  const commit = () => {
    const anchor = fromLocalInput(draft)
    setDraft(null)
    if (anchor !== null && anchor !== start) onShift(anchor)
  }
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className='flex flex-wrap items-center gap-1'>
      <input
        type='datetime-local'
        step='1'
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(null)
        }}
        className='rounded border border-gray-300 px-1 py-0.5 text-xs'
      />
      <button
        type='button'
        onClick={commit}
        className='rounded bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white'>
        Set
      </button>
      <button
        type='button'
        onClick={() => setDraft(null)}
        className='text-[11px] text-gray-500 underline'>
        cancel
      </button>
    </span>
  )
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
  picking,
  onDragFile,
  statusOf
}: {
  files: ManifestFile[]
  picking: boolean
  onDragFile: WallHooks['onDragFile']
  statusOf: WallHooks['statusOf']
}) => (
  <div className='mt-2 flex gap-1 overflow-hidden'>
    {files.slice(0, 4).map((file, index) => (
      <span
        key={`${index}:${file.path}`}
        className='relative'>
        <img
          src={getThumbUrl(file.path, 0.5, 80)}
          alt=''
          loading='lazy'
          draggable
          onDragStart={(e) => onDragFile(file, e)}
          className='h-8 w-11 rounded bg-gray-100 object-cover'
        />
        {picking && <StatusDot status={statusOf(file)} />}
      </span>
    ))}
  </div>
)

/* One file as a row: what it is, when it was shot, how big, and where it has got to. */
const FileLine = ({
  file,
  selected,
  picking,
  status,
  onClick,
  onDragStart
}: {
  file: ManifestFile
  selected: boolean
  picking: boolean
  status: FileStatus
  onClick: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
}) => (
  <li>
    <button
      type='button'
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded border px-1.5 py-1 text-left ${
        selected ? 'border-teal-600 bg-teal-50' : 'border-transparent hover:bg-gray-50'
      }`}>
      {(picking || selected) && (
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] leading-none ${
            selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-400 bg-white'
          }`}>
          ✓
        </span>
      )}
      <img
        src={getThumbUrl(file.path, 0.5, 80)}
        alt=''
        loading='lazy'
        className='h-7 w-10 shrink-0 rounded bg-gray-100 object-cover'
      />
      <span className='min-w-0 flex-1 truncate font-mono text-[11px] text-gray-700'>
        {file.filename}
      </span>
      {file.cropStart != null && file.cropEnd != null && (
        <span
          title={`Cropped ${file.cropStart.toFixed(1)}s → ${file.cropEnd.toFixed(1)}s`}
          className='shrink-0 text-[10px]'>
          ✂️
        </span>
      )}
      <span className='shrink-0 font-mono text-[11px] text-gray-500'>{formatTime(file.mtime)}</span>
      <span className='w-16 shrink-0 text-right text-[11px] text-gray-400 tabular-nums'>
        {formatSize(file.size)}
      </span>
      <StatusChip status={status} />
    </button>
  </li>
)

/* what an upload is doing right now: the dedup pass first, then the bytes. Without the checking
   line a re-upload looks frozen while the NAS hashes hundreds of files. */
const formatFilmSize = (bytes: number) =>
  bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

/* The editor is opened by hand — SkyDock runs where it cannot start an application on the machine
   you are sitting at — so the least it can do is say exactly which file, spelled the way that
   machine knows it, and hand it over without anyone reading a path off the screen. */
const ProjectPath = ({ path: projectPath }: { path: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(projectPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard access can be refused; the full path is in the tooltip either way */
    }
  }
  return (
    <button
      type='button'
      onClick={copy}
      title={`${projectPath}\n\nClick to copy`}
      className='max-w-[22rem] truncate font-mono text-[11px] text-gray-400 hover:text-teal-700'>
      {copied ? '✓ copied' : `${projectPath} ⧉`}
    </button>
  )
}

/* One step at a time, always in the same place. The three are distinct and never offered out of
   order (RULES, The board): Process copies and crops here, Montage writes the project the editor
   opens, Deliver hands over what was rendered. Deliver stays enabled with no film yet, because a
   disabled button cannot say why — and pressing it is also how the board looks again, there being
   nothing that notices a render finishing. */
const TandemActions = ({
  group,
  facts,
  busy,
  blocked,
  named,
  onProcess,
  onMontage,
  onDeliver
}: {
  group: ManifestGroup
  facts?: {
    project: boolean
    projectPath: string
    film: { size: number; mtime: number } | null
    baseName: string
  }
  busy: string | null
  blocked: { blocked: boolean; message: string | null }
  named: boolean
  onProcess: () => void
  onMontage: () => void
  onDeliver: () => void
}) => {
  const working = busy !== null
  const deliverKey = `deliver:${group.id}`
  if (!group.processed)
    return (
      <span className='ml-auto flex items-center gap-2'>
        <button
          type='button'
          disabled={working || !named}
          onClick={onProcess}
          className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
          {busy === group.id ? 'Processing…' : 'Process'}
        </button>
      </span>
    )
  if (!facts?.project)
    return (
      <span className='ml-auto flex items-center gap-2'>
        <button
          type='button'
          disabled={working}
          title='Write the kdenlive project, with the clips laid out and the render destination set'
          onClick={onMontage}
          className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
          {busy === group.id ? 'Writing…' : 'Montage'}
        </button>
      </span>
    )
  return (
    <span className='ml-auto flex items-center gap-2'>
      <ProjectPath path={facts.projectPath} />
      {facts.film ? (
        <span className='text-[11px] text-gray-500'>film {formatFilmSize(facts.film.size)}</span>
      ) : (
        <span className='text-[11px] text-gray-400'>edit and render it</span>
      )}
      {group.delivered && <span className='text-[11px] text-green-700'>✓ delivered</span>}
      <button
        type='button'
        disabled={working || blocked.blocked}
        title={
          blocked.message ??
          'Zip the photos and the rushes, then send the film and the photos to the passenger'
        }
        onClick={onDeliver}
        className='rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
        {busy === deliverKey ? 'Delivering…' : group.delivered ? 'Deliver again' : 'Deliver'}
      </button>
      {group.publish?.shareUrl && (
        <a
          href={group.publish.shareUrl}
          target='_blank'
          rel='noreferrer'
          className='text-[11px] text-teal-700 underline'>
          share link
        </a>
      )}
    </span>
  )
}

const UploadStrip = ({ progress }: { progress: UploadProgressState }) => {
  const percent =
    progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.bytesUploaded / progress.totalBytes) * 100))
      : 0
  if (progress.state === 'archiving')
    return (
      <p className='mt-1 text-[11px] text-gray-500'>
        Zipping the {progress.filename.replace('.zip', '')} — {progress.fileIndex}/
        {progress.totalFiles} files
      </p>
    )
  if (progress.state === 'checking')
    return (
      <p className='mt-1 text-[11px] text-gray-500'>
        Checking what is already there — {progress.checked ?? 0}/{progress.totalFiles}
      </p>
    )
  if (progress.state === 'error')
    return <p className='mt-1 text-[11px] text-red-700'>Upload failed: {progress.error}</p>
  if (progress.state === 'done')
    return (
      <p className='mt-1 text-[11px] text-green-700'>
        ✓ uploaded{progress.skipped ? ` · ${progress.skipped} already there` : ''}
      </p>
    )
  return (
    <div className='mt-1'>
      <p className='truncate text-[11px] text-gray-500'>
        Uploading {progress.fileIndex + 1}/{progress.totalFiles} · {progress.filename} {percent}%
      </p>
      <div className='mt-0.5 h-1 w-full overflow-hidden rounded bg-gray-200'>
        <div
          className='h-full bg-teal-600'
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/* one wall of thumbnails; `lane` is the run a shift-click range covers */
const Wall = ({
  files,
  lane,
  onPreview,
  split,
  picked,
  onFile,
  onDragFile,
  statusOf,
  view
}: WallHooks & {
  files: ManifestFile[]
  lane: ManifestFile[]
  onPreview: (file: ManifestFile) => void
  split?: boolean
}) => {
  const strip = (list: ManifestFile[], small?: boolean) =>
    view === 'rows' ? (
      <ul className='mt-1 space-y-0.5'>
        {list.map((file, index) => (
          <FileLine
            key={`${index}:${file.path}`}
            file={file}
            selected={!!file.id && picked.includes(file.id)}
            picking={picked.length > 0}
            status={statusOf(file)}
            onClick={(e) => onFile(file, lane, e, () => onPreview(file))}
            onDragStart={(e) => onDragFile(file, e)}
          />
        ))}
      </ul>
    ) : (
      <div className='mt-1 flex flex-wrap gap-1'>
        {list.map((file, index) => (
          <Thumb
            key={`${index}:${file.path}`}
            file={file}
            small={small}
            selected={!!file.id && picked.includes(file.id)}
            picking={picked.length > 0}
            status={statusOf(file)}
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
  /* one value, so two dialogs can never be open at once; `destination` set means the folder is
     being chosen for that card rather than as the global default */
  const [dialog, setDialog] = useState<
    null | { kind: 'connect' } | { kind: 'folder'; destination?: string; target?: 'backup' }
  >(null)
  const [dialogOpenedOn, setDialogOpenedOn] = useState<unknown>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, OutputFact>>(loaderData.outputs)
  const [tandemFacts, setTandemFacts] = useState<TandemFacts>(loaderData.tandems)
  const [remoteAfterUpload, setRemoteAfterUpload] = useState<CheckedListing | null>(null)
  /* the first scan is what creates the manifest, so this is state and not read from the loader */
  const [hasManifest, setHasManifest] = useState(loaderData.hasManifest)
  const view = useFileView()
  const fetcher = useSafeFetcher()
  /* NAS answers must not land in the groups effect below, so they get their own fetcher */
  const nasFetcher = useSafeFetcher()
  /* what the NAS currently holds, so a file deleted over there stops reading as uploaded */
  const remoteFetcher = useSafeFetcher()
  /* A lone file's crop goes through the same save as everything else, on the registry entry — and
     the board's own copy has to be updated with it. `updateGroups` refreshes `groups` optimistically
     but answers on its own fetcher, so nothing here ever hears about the saved loose files: without
     this the crop was invisible until a reload, and re-opening the preview read back the stale
     uncropped file. */
  const cropLoneFile = (
    file: ManifestFile,
    range: { cropStart: number | null; cropEnd: number | null }
  ) => {
    const cropped = { ...file, cropStart: range.cropStart, cropEnd: range.cropEnd }
    setLoose((current) => current.map((f) => (f.path === file.path ? cropped : f)))
    updateGroups(groups, [cropped])
  }
  const preview = usePreview(groups, updateGroups, cropLoneFile)
  const progress = useUploadProgress(uploading)

  /* derived, never stored: the loader is the first paint and the fetcher is the live truth */
  const nasAnswer = nasSuccessSchema.safeParse(nasFetcher.data)
  const nasConnected = nasAnswer.success ? nasAnswer.data.connected : loaderData.nas.connected
  const nasHost = nasAnswer.success ? (nasAnswer.data.hostname ?? null) : loaderData.nas.hostname
  const defaultFolder = nasAnswer.success
    ? (nasAnswer.data.defaultFolder ?? null)
    : loaderData.nas.defaultFolder
  const backupFolder = nasAnswer.success
    ? (nasAnswer.data.backupFolder ?? null)
    : loaderData.nas.backupFolder
  const nasRefused = nasErrorSchema.safeParse(nasFetcher.data)
  const nasError =
    !nasAnswer.success && nasRefused.success ? nasRefused.data.globalErrors?.[0] : undefined
  /* the dialog closes itself once a *new* answer says we are connected */
  const connectSucceeded =
    nasAnswer.success && nasAnswer.data.connected && nasFetcher.data !== dialogOpenedOn

  /* the server answers with the groups it saved, or with the reason it refused */
  useEffect(() => {
    if (!fetcher.data) return
    const answered = z
      .object({
        groups: z.array(manifestGroupSchema),
        looseFiles: z.array(manifestFileSchema).optional(),
        destinations: z.array(destinationSchema).optional(),
        outputs: z
          .record(z.string(), z.object({ exists: z.boolean(), size: z.number() }))
          .optional(),
        tandems: z.record(z.string(), tandemFactSchema).optional(),
        remote: z
          .object({
            dirs: z.array(z.string()),
            sizes: z.record(z.string(), z.number().nullable()),
            at: z.number()
          })
          .optional(),
        uploaded: z.number().optional(),
        skipped: z.number().optional(),
        montage: z.object({ clips: z.number(), missingAssets: z.array(z.string()) }).optional(),
        scan: scanResultSchema.optional()
      })
      .safeParse(fetcher.data)
    if (answered.success) {
      const {
        groups: saved,
        looseFiles,
        destinations,
        outputs: freshOutputs,
        tandems: freshTandems,
        remote: freshRemote,
        uploaded,
        skipped,
        montage,
        scan: scanned
      } = answered.data
      queueMicrotask(() => {
        setGroups(saved)
        if (looseFiles) setLoose(looseFiles)
        if (destinations) setPlaces(destinations)
        if (freshOutputs) setOutputs(freshOutputs)
        if (freshTandems) setTandemFacts(freshTandems)
        /* an upload answers with the listing taken right after it */
        if (freshRemote) setRemoteAfterUpload(freshRemote)
        /* a scan may be the first thing that ever put a manifest there */
        if (scanned) setHasManifest(true)
        setBusy(null)
        setUploading(null)
        setNote(
          uploaded !== undefined
            ? `Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}${
                skipped ? ` · ${skipped} already on the NAS` : ''
              }`
            : montage
              ? montageNote(montage)
              : scanned
                ? scanNote(scanned)
                : null
        )
      })
      return
    }
    const refused = z
      .object({ success: z.literal(false), globalErrors: z.array(z.string()).optional() })
      .passthrough()
      .safeParse(fetcher.data)
    queueMicrotask(() => {
      setBusy(null)
      setUploading(null)
      if (refused.success) setNote(refused.data.globalErrors?.[0] ?? 'Request failed')
    })
  }, [fetcher.data, setGroups])

  const scanning = busy === 'scan'
  const scan = () => {
    setNote(null)
    setBusy('scan')
    fetcher.submit({ url: '/api/scan', actionArgs: {} })
  }

  const unsorted = groups.filter((g) => !g.destination)
  const locations = places.filter((d) => d.name !== TANDEMS)
  const tandems = groups.filter(inTandemsCard)
  /* a loose file that carries a destination is shown inside that card, not in the sorting area —
     it is a real lone file destined for that folder (RULES, Dropzones and tandems), not something still to sort */
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

  const shiftJump = (groupId: string, anchorEpoch: number) => {
    setNote(null)
    setBusy('shift')
    fetcher.submit({
      url: '/api/manifest',
      actionArgs: { intent: 'shift-group-time', groupId, anchorEpoch }
    })
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

  const openConnect = () => {
    setDialogOpenedOn(nasFetcher.data)
    setDialog({ kind: 'connect' })
  }

  const connect = (host: string, user: string, password: string) =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'connect', host, user, password } })

  const disconnect = () =>
    nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })

  /* the two session folders — where uploads go and where the originals are kept — go through the
     NAS session; a destination's own folder is part of the workspace, so it is saved with the
     destinations list like any other board edit */
  const chooseFolder = (path: string, destination?: string, target?: 'backup') => {
    if (destination === undefined) {
      nasFetcher.submit({
        url: '/api/nas',
        actionArgs: { intent: 'select-folder', path, kind: target ?? 'default' }
      })
    } else {
      const known = places.some((d) => d.name === destination)
      saveDestinations(
        known
          ? places.map((d) => (d.name === destination ? { ...d, path } : d))
          : [...places, { name: destination, path }]
      )
    }
    setDialog(null)
  }

  const folderFor = (destination: string) => {
    const place = places.find((d) => d.name === destination)
    if (place?.path) return place.path
    return defaultFolder ? `${defaultFolder}/${destination}` : null
  }

  /* the client opens whichever dialog is missing rather than firing a request the server would
     only refuse — but the server still decides, so the client never guesses a path */
  const requestUpload = (scope: { groupIds?: string[]; destination?: string }, key: string) => {
    if (!nasConnected) {
      openConnect()
      return
    }
    if (scope.destination && !folderFor(scope.destination)) {
      setDialog({ kind: 'folder', destination: scope.destination })
      return
    }
    if (!scope.destination && !defaultFolder) {
      setDialog({ kind: 'folder' })
      return
    }
    setNote(null)
    setBusy(key)
    setUploading(key)
    fetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'upload-group', ...scope } })
  }

  const createMontage = (group: ManifestGroup) => {
    setNote(null)
    setBusy(group.id)
    fetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'montage', groupId: group.id } })
  }

  /* the same shape as an upload: open whichever choice is missing rather than firing a request the
     server would only refuse. The backup folder has no fallback — putting the rushes in a
     passenger's folder is the failure keeping them apart exists to prevent. */
  const deliver = (group: ManifestGroup) => {
    if (!nasConnected) {
      openConnect()
      return
    }
    if (!defaultFolder) {
      setDialog({ kind: 'folder' })
      return
    }
    if (!backupFolder) {
      setDialog({ kind: 'folder', target: 'backup' })
      return
    }
    const key = `deliver:${group.id}`
    setNote(null)
    setBusy(key)
    setUploading(key)
    fetcher.submit({ url: '/api/manifest', actionArgs: { intent: 'deliver', groupId: group.id } })
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

  /* Only a listing that came back may demote a file; a NAS that was never asked, or that failed,
     leaves every proven upload alone (RULES, File status). */
  const remoteAnswer = remoteFilesSchema.safeParse(remoteFetcher.data)
  const fresh = remoteAnswer.success && remoteAnswer.data.ok ? remoteAnswer.data : null
  /* the loader took the first look; an upload's own listing or a Refresh replaces it, newest wins */
  const seen: CheckedListing[] = [fresh, remoteAfterUpload, loaderData.remote].filter(
    (r): r is CheckedListing => r !== null
  )
  const newest = seen.length === 0 ? null : seen.reduce((a, b) => (a.at >= b.at ? a : b))
  const remote: RemoteListing | null = newest
  const remoteCheckedAt = newest?.at ?? null

  const statusContext = (file: ManifestFile) => ({
    crop: { cropStart: file.cropStart, cropEnd: file.cropEnd },
    output: outputs[file.path],
    remote
  })
  const statusOf = (file: ManifestFile) => fileStatus(file, statusContext(file))
  const gateFor = (files: ManifestFile[]) => uploadGate(files, statusContext)

  const checkRemote = () => remoteFetcher.load({ url: '/api/remote-files' })

  /* every wall of thumbnails needs the same things from the board */
  const wall = {
    picked: pickedFiles,
    onFile: clickFile,
    onDragFile: startFileDrag,
    statusOf,
    view
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
        if (draggedFiles.length > 0) moveFiles(draggedFiles, destination, destination === TANDEMS)
        else if (dragged.length > 0) assign(dragged, destination)
        setDragged([])
        setDraggedFiles([])
      }
    }
  }

  if (!hasManifest) {
    return (
      <main className='mx-auto max-w-5xl p-6'>
        <h1 className='text-xl font-semibold'>Nothing here yet</h1>
        <p className='mt-2 text-sm text-gray-600'>
          Copy the cameras into the output folder, then scan to find the jumps.
        </p>
        {note && <p className='mt-3 text-sm text-amber-900'>{note}</p>}
        <button
          type='button'
          disabled={scanning}
          onClick={scan}
          className='mt-4 rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'>
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
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
        <span className='ml-auto flex flex-wrap items-center gap-2 text-xs'>
          <button
            type='button'
            disabled={scanning}
            onClick={scan}
            title='Look through the output folder for files the manifest does not know about yet'
            className='rounded border border-gray-300 bg-white px-2 py-0.5 font-semibold disabled:opacity-50'>
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
          <span
            className={`h-2 w-2 rounded-full ${nasConnected ? 'bg-green-500' : 'bg-gray-300'}`}
          />
          {nasConnected ? (
            <>
              <span className='text-gray-600'>{nasHost ?? 'NAS'}</span>
              <button
                type='button'
                onClick={() => setDialog({ kind: 'folder' })}
                title='The folder used by anything without a folder of its own'
                className='rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-[11px]'>
                {defaultFolder ?? 'no default folder'}
              </button>
              <button
                type='button'
                onClick={() => setDialog({ kind: 'folder', target: 'backup' })}
                title='Where the original videos are archived — never a folder a passenger can see'
                className='rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-[11px]'>
                {backupFolder ? `backup ${backupFolder}` : 'no backup folder'}
              </button>
              <button
                type='button'
                disabled={remoteFetcher.state !== 'idle'}
                onClick={checkRemote}
                title='Ask the NAS what it holds now — a file deleted there stops reading as uploaded'
                className='rounded border border-gray-300 bg-white px-2 py-0.5 disabled:opacity-50'>
                {remoteFetcher.state !== 'idle'
                  ? 'Checking…'
                  : remoteCheckedAt
                    ? `⟳ checked ${formatTime(remoteCheckedAt)}`
                    : '⟳ check NAS'}
              </button>
              <button
                type='button'
                onClick={disconnect}
                className='text-gray-500 underline'>
                disconnect
              </button>
            </>
          ) : (
            <button
              type='button'
              onClick={openConnect}
              className='rounded bg-teal-700 px-3 py-1 font-semibold text-white'>
              Connect the NAS
            </button>
          )}
          <span className='flex overflow-hidden rounded border border-gray-300'>
            {(['rows', 'grid'] as const).map((mode) => (
              <button
                key={mode}
                type='button'
                onClick={() => setFileView(mode)}
                className={`px-2 py-0.5 ${
                  view === mode ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'
                }`}>
                {mode}
              </button>
            ))}
          </span>
          <StatusLegend />
        </span>
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
                            <JumpTime
                              start={minFileMtime(group.files) ?? 0}
                              disabled={busy !== null}
                              onShift={(anchor) => shiftJump(group.id, anchor)}
                            />
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
                              picking={pickedFiles.length > 0}
                              onDragFile={startFileDrag}
                              statusOf={statusOf}
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
                        onPreview={(file) => preview.handlePreview(file, LOOSE)}
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
              /* a changed file reads `local` again, and nothing leaves until it is processed */
              const gate = gateFor([...inside.flatMap((g) => g.files), ...lone])
              return (
                <section
                  key={destination.name}
                  {...dropTarget(destination.name)}
                  className={`rounded-xl border bg-white p-4 ${
                    overTarget === `dest:${destination.name}`
                      ? 'border-dashed border-teal-500'
                      : 'border-gray-200'
                  }`}>
                  <div className='flex flex-wrap items-baseline gap-2'>
                    <h3 className='font-semibold'>{destination.name}</h3>
                    <span className='text-xs text-gray-500'>
                      {inside.reduce((n, g) => n + g.files.length, 0) + lone.length} files
                    </span>
                    {(inside.length > 0 || lone.length > 0) && (
                      <button
                        type='button'
                        disabled={busy !== null || gate.blocked}
                        onClick={() =>
                          requestUpload(
                            { destination: destination.name },
                            `dest:${destination.name}`
                          )
                        }
                        title={
                          gate.message ??
                          'Send this dropzone to the NAS — files already there are skipped'
                        }
                        className='ml-auto rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50'>
                        {busy === `dest:${destination.name}` ? 'Uploading…' : 'Upload'}
                      </button>
                    )}
                  </div>
                  {gate.blocked && (
                    <p className='mt-1 text-[11px] text-amber-700'>
                      {gate.message} — process before uploading
                    </p>
                  )}
                  <p className='mt-1 font-mono text-[11px] text-gray-400'>
                    processed/{destination.name}/ · every file lands here directly
                  </p>
                  <div className='mt-1 flex flex-wrap items-center gap-2'>
                    <span className='text-[11px] text-gray-400'>NAS</span>
                    <button
                      type='button'
                      onClick={() => setDialog({ kind: 'folder', destination: destination.name })}
                      title='Choose the NAS folder this dropzone uploads into'
                      className='rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-[11px]'>
                      {folderFor(destination.name) ?? 'choose a folder'}
                    </button>
                    {destination.path && (
                      <button
                        type='button'
                        onClick={() =>
                          saveDestinations(
                            places.map((d) =>
                              d.name === destination.name
                                ? { name: d.name, shareUrl: d.shareUrl }
                                : d
                            )
                          )
                        }
                        title='Fall back to the default upload folder'
                        className='text-[11px] text-gray-500 underline'>
                        clear
                      </button>
                    )}
                    {destination.shareUrl && (
                      <a
                        href={destination.shareUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='text-[11px] text-teal-700 underline'>
                        share link
                      </a>
                    )}
                  </div>
                  {uploading === `dest:${destination.name}` && progress && (
                    <UploadStrip progress={progress} />
                  )}
                  {days.length === 0 && (
                    <p className='mt-3 text-xs text-gray-400'>Drag jumps or files here.</p>
                  )}
                  {days.map((day) => {
                    const dayGroups = inside.filter((g) => dayOf(g) === day)
                    const dayLone = lone.filter((f) => dayOfFile(f) === day)
                    /* a day row mixes whole jumps and lone files — on disk they are the same
                       flat folder (RULES, Dropzones and tandems), so they are drawn as one run of thumbnails */
                    const files = byMtime([...dayGroups.flatMap((g) => g.files), ...dayLone])
                    const owner = new Map(
                      dayGroups.flatMap((g) => g.files.map((f) => [f.path, g] as const))
                    )
                    const key = `${destination.name}:${day}`
                    /* the day needs processing when any of its files reads `local` — the same
                       fact the chips show, rather than a second opinion from a group flag */
                    const pending = files.some((f) => statusOf(f) === 'local')
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
                                 processed by destination scope instead of by group ids (RULES, What lands on disk) */
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
                              else preview.handlePreview(file, LOOSE)
                            }}
                          />
                        ) : (
                          <Peek
                            files={files}
                            picking={pickedFiles.length > 0}
                            onDragFile={startFileDrag}
                            statusOf={statusOf}
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
                        onPreview={(file) => preview.handlePreview(file, LOOSE)}
                      />
                    ) : (
                      <Peek
                        files={stray}
                        picking={pickedFiles.length > 0}
                        onDragFile={startFileDrag}
                        statusOf={statusOf}
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
                  <span className='text-xs text-gray-500'>
                    <JumpTime
                      start={minFileMtime(group.files) ?? 0}
                      disabled={busy !== null}
                      onShift={(anchor) => shiftJump(group.id, anchor)}
                    />
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
                  <TandemActions
                    group={group}
                    facts={tandemFacts[group.id]}
                    busy={busy}
                    blocked={gateFor(group.files)}
                    named={passengerName(group) !== ''}
                    onProcess={() => run(group.id, { intent: 'process', groupId: group.id })}
                    onMontage={() => createMontage(group)}
                    onDeliver={() => deliver(group)}
                  />
                </div>
                {uploading === `deliver:${group.id}` && progress && (
                  <UploadStrip progress={progress} />
                )}
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
                    picking={pickedFiles.length > 0}
                    onDragFile={startFileDrag}
                    statusOf={statusOf}
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

      {dialog?.kind === 'connect' && !connectSucceeded && (
        <ConnectionDialog
          onConnect={connect}
          onCancel={() => setDialog(null)}
          error={nasError}
        />
      )}

      {dialog?.kind === 'folder' && (
        <NasFolderBrowser
          open
          initialPath={
            dialog.destination
              ? (places.find((d) => d.name === dialog.destination)?.path ?? undefined)
              : (defaultFolder ?? undefined)
          }
          title={
            dialog.destination
              ? `NAS folder for ${dialog.destination}`
              : dialog.target === 'backup'
                ? 'Folder for the original videos'
                : 'Default NAS upload folder'
          }
          onSelect={(path) => chooseFolder(path, dialog.destination, dialog.target)}
          onClose={() => setDialog(null)}
        />
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
