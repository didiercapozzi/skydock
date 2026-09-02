import { loadManifest } from '@skydock/scripts'
import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useFetcher, useLoaderData, useRevalidator } from 'react-router'
import { CompareDrawer } from '../components/review/compare-drawer'
import { FileRow } from '../components/review/file-row'
import { JumpDaySection } from '../components/review/jump-day-section'
import { PreviewDrawer } from '../components/review/preview-drawer'
import { SelectedJumpsPanel } from '../components/review/selected-jumps-panel'
import { StagingTray } from '../components/review/staging-tray'
import { TimelineJumps } from '../components/review/timeline-jumps'
import type { PreviewState, SelectionMap } from '../components/review/types'
import { getJumpBounds, groupJumpsByDay } from '../components/review/utils'
import { ensureManifestFileIds } from '../lib/fileId.server'
import { getOutputDirPath, scanOutput } from '../lib/scanner.server'
import type { SystemStatus } from '../lib/status.server'
import type {
  DayGroup,
  FileEntry,
  Jump,
  Manifest,
  ManifestFile,
  ManifestJump,
  TheoryVideoWithSource
} from '../lib/types'
import type { Route } from './+types/home'

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const fileUrl = (filePath: string): string => `/api/file?path=${encodeURIComponent(filePath)}`

const formatTime = (epoch: number): string => {
  if (epoch === 0) return ''
  const d = new Date(epoch * 1000)
  return d.toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich'
  })
}

const VideoIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    strokeWidth={2}>
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
    />
  </svg>
)

const PhotoIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    strokeWidth={2}>
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
    />
  </svg>
)

const FileCard = ({
  file,
  type,
  onOpen
}: {
  file: FileEntry
  type: 'photo' | 'video'
  onOpen: (file: FileEntry) => void
}) => {
  const isVideo = type === 'video'
  return (
    <div
      className={`group rounded-lg border transition hover:shadow-md cursor-pointer ${
        file.isTheory
          ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
      }`}
      onClick={() => onOpen(file)}>
      <div className='aspect-video rounded-t-lg overflow-hidden bg-gray-100 dark:bg-gray-800'>
        <img
          src={fileUrl(file.path)}
          alt=''
          className='w-full h-full object-cover'
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextElementSibling?.classList.remove('hidden')
          }}
        />
        <div
          className={`w-full h-full items-center justify-center hidden ${
            isVideo ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
          {isVideo ? (
            <VideoIcon className='w-8 h-8 text-purple-500' />
          ) : (
            <PhotoIcon className='w-8 h-8 text-blue-500' />
          )}
        </div>
      </div>
      <div className='px-3 py-2'>
        <p className='text-xs font-mono text-gray-900 dark:text-gray-100 truncate'>{file.name}</p>
        <div className='flex items-center gap-2 mt-1'>
          <span className='text-[10px] text-gray-400 dark:text-gray-500 tabular-nums'>
            {formatBytes(file.size)}
          </span>
          {file.isTheory && (
            <span className='text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium'>
              library
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const JumpColumn = ({
  jump,
  type,
  onOpenFile
}: {
  jump: Jump
  type: 'photo' | 'video'
  onOpenFile: (file: FileEntry) => void
}) => {
  const files = type === 'photo' ? jump.jumpPhotos : jump.jumpVideos
  const Icon = type === 'photo' ? PhotoIcon : VideoIcon
  const color = type === 'photo' ? 'blue' : 'purple'
  if (files.length === 0) return null
  return (
    <div className='mb-4'>
      <div className='flex items-center gap-2 mb-2 px-1'>
        <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
        <span className='text-xs font-medium text-gray-700 dark:text-gray-300'>
          {jump.name || jump.displayName}
        </span>
        {jump.startedAt > 0 && (
          <span className='text-[10px] text-gray-400 dark:text-gray-500 tabular-nums'>
            {formatTime(jump.startedAt)}
          </span>
        )}
        <span className='text-[10px] text-gray-400 dark:text-gray-500'>{files.length}</span>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        {files.map((f) => (
          <FileCard
            key={f.name}
            file={f}
            type={type}
            onOpen={onOpenFile}
          />
        ))}
      </div>
    </div>
  )
}

const FileDrawer = ({ file, onClose }: { file: FileEntry; onClose: () => void }) => {
  const fetcher = useFetcher()
  const isVideo = file.name.toLowerCase().endsWith('.mp4')
  return (
    <>
      <div
        className='fixed inset-0 bg-black/50 z-40'
        onClick={onClose}
      />
      <div className='fixed right-0 top-0 h-full w-[500px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col'>
        <div className='flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800'>
          <p className='text-sm font-mono text-gray-900 dark:text-gray-100 truncate flex-1 mr-4'>
            {file.name}
          </p>
          <button
            type='button'
            onClick={onClose}
            className='w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer'>
            <svg
              className='w-4 h-4'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>
        <div className='flex-1 flex items-center justify-center p-4 overflow-auto bg-gray-50 dark:bg-gray-950'>
          {isVideo ? (
            <video
              src={fileUrl(file.path)}
              controls
              autoPlay
              className='max-w-full max-h-full rounded-lg'
            />
          ) : (
            <img
              src={fileUrl(file.path)}
              alt={file.name}
              className='max-w-full max-h-full object-contain rounded-lg'
            />
          )}
        </div>
        <div className='px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between'>
          <span className='text-xs text-gray-500 dark:text-gray-400'>{formatBytes(file.size)}</span>
          <button
            type='button'
            onClick={() => {
              fetcher.submit({ path: file.path }, { method: 'post', action: '/api/open' })
            }}
            className='text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer'>
            Open in player
          </button>
        </div>
      </div>
    </>
  )
}

const loader = async (_args?: Route.LoaderArgs) => {
  const manifestPath = path.join(getOutputDirPath(), 'manifest.json')
  await ensureManifestFileIds(manifestPath)
  const manifest = loadManifest(manifestPath) as Manifest | null
  let days: DayGroup[] = []
  let libraryFiles: TheoryVideoWithSource[] = []
  try {
    const out = scanOutput()
    days = out.days
    libraryFiles = out.libraryFiles
  } catch {}
  return { manifest, days, libraryFiles }
}

const meta = (_args: Route.MetaArgs) => [
  { title: 'SkyDock - Tandem Jump Media' },
  { name: 'description', content: 'Browse your ingested tandem skydiving footage' }
]

type HomeProps = { loaderData?: Route.ComponentProps['loaderData'] }

const Home = ({ loaderData: propLoaderData }: HomeProps) => {
  let hookData: Route.ComponentProps['loaderData'] | undefined
  try {
    hookData = useLoaderData<typeof loader>() as Route.ComponentProps['loaderData']
  } catch {
    hookData = undefined
  }
  const loaderData = (propLoaderData ?? hookData) as
    | { manifest?: Manifest | null; days?: DayGroup[]; libraryFiles?: TheoryVideoWithSource[] }
    | undefined
  const manifest = (loaderData as { manifest?: Manifest | null })?.manifest ?? null
  const days = (loaderData as { days?: DayGroup[] })?.days
  const _libraryFiles = (loaderData as { libraryFiles?: TheoryVideoWithSource[] })?.libraryFiles
  const hasDashboardProp = loaderData !== undefined && 'days' in (loaderData as object)
  const hasManifestProp = loaderData !== undefined && 'manifest' in (loaderData as object)
  const showDashboard = hasDashboardProp
  const showReview = hasManifestProp
  const fallbackShowDashboard = !hasDashboardProp && !hasManifestProp
  const effectiveDays = days ?? []
  const _manifestFetcher = useFetcher()
  const scanFetcher = useFetcher()
  const simulateFetcher = useFetcher()
  const { revalidate } = useRevalidator()
  const [openFile, setOpenFile] = useState<FileEntry | null>(null)
  const [selection, setSelection] = useState<SelectionMap>({})
  const [_lastClicked, setLastClicked] = useState<string | null>(null)
  const lastClickedRef = useRef<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [copyMode, setCopyMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)
  const trayDragRef = useRef<{
    filePaths: string[]
    sourceGroups: Record<string, string[]>
  } | null>(null)

  const totalJumps = effectiveDays.reduce((s, d) => s + d.jumps.length, 0)
  const totalPhotos = effectiveDays.reduce((s, d) => s + d.totalPhotos, 0)
  const totalVideos = effectiveDays.reduce((s, d) => s + d.totalVideos, 0)
  const simulating = simulateFetcher.state !== 'idle'

  useEffect(() => {
    if (simulateFetcher.state === 'idle' && simulateFetcher.data) {
      revalidate()
    }
  }, [simulateFetcher.state, simulateFetcher.data, revalidate])

  useEffect(() => {
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status')
        const data = (await res.json()) as { ok: boolean; status: SystemStatus }
        if (cancelled || !data.ok) return
        setSystemStatus(data.status)
      } catch {}
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const scanning = scanFetcher.state !== 'idle' || systemStatus?.scan.state === 'running'
  const isExecuteRunning = systemStatus?.execute.state === 'running'
  const isProcessRunning = systemStatus?.process.state === 'running'

  const manifestSubmit = useCallback(
    (body: Record<string, string | number | boolean | string[]>) => {
      _manifestFetcher.submit(body, {
        method: 'POST',
        encType: 'application/json',
        action: '/api/manifest'
      })
      void fetch('/api/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).catch(() => {})
    },
    [_manifestFetcher]
  )

  const jumpsByDay = useMemo(() => (manifest ? groupJumpsByDay(manifest.jumps) : []), [manifest])

  const filesInJumps = useMemo(() => {
    if (!manifest) return new Set<string>()
    return new Set(manifest.jumps.flatMap((j) => j.files.map((f) => f.path)))
  }, [manifest])

  const unassignedFiles = useMemo(() => {
    if (!manifest) return []
    return manifest.files.filter((f) => !filesInJumps.has(f.path))
  }, [manifest, filesInJumps])

  const multiJumpFiles = useMemo(() => {
    if (!manifest) return new Set<string>()
    const pathCounts = new Map<string, number>()
    for (const jump of manifest.jumps) {
      for (const f of jump.files) {
        pathCounts.set(f.path, (pathCounts.get(f.path) ?? 0) + 1)
      }
    }
    return new Set([...pathCounts.entries()].filter(([, c]) => c > 1).map(([p]) => p))
  }, [manifest])

  const allFileIds = useMemo(() => {
    if (!manifest) return []
    return [
      ...unassignedFiles.map((f) => f.path),
      ...manifest.jumps.flatMap((j) => j.files.map((f) => f.path))
    ]
  }, [manifest, unassignedFiles])

  const hasCalibration = useMemo(
    () => manifest?.files.some((f) => f.originalMtime !== undefined) ?? false,
    [manifest]
  )

  const handleSelect = useCallback(
    (groupId: string, filePath: string, _ctrlKey: boolean, shiftKey: boolean) => {
      const prevLast = lastClickedRef.current
      setLastClicked(filePath)
      lastClickedRef.current = filePath
      setSelection((prev) => {
        const next: SelectionMap = {}
        for (const [k, v] of Object.entries(prev)) next[k] = { ...v }
        if (shiftKey && prevLast) {
          const sIdx = allFileIds.indexOf(prevLast)
          const eIdx = allFileIds.indexOf(filePath)
          if (sIdx !== -1 && eIdx !== -1) {
            const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
            const pathToGroup = new Map<string, string>()
            if (manifest) {
              for (const f of unassignedFiles) pathToGroup.set(f.path, 'unassigned')
              for (const j of manifest.jumps) for (const f of j.files) pathToGroup.set(f.path, j.id)
            }
            for (let i = from; i <= to; i++) {
              const id = allFileIds[i]
              const gid = pathToGroup.get(id) ?? groupId
              if (!next[gid]) next[gid] = {}
              else next[gid] = { ...next[gid] }
              next[gid][id] = true
            }
            return next
          }
        }
        if (!next[groupId]) next[groupId] = {}
        else next[groupId] = { ...next[groupId] }
        if (next[groupId][filePath]) {
          const g = { ...next[groupId] }
          delete g[filePath]
          if (Object.keys(g).length === 0) delete next[groupId]
          else next[groupId] = g
        } else {
          next[groupId] = { ...next[groupId], [filePath]: true }
        }
        return next
      })
    },
    [allFileIds, manifest, unassignedFiles]
  )

  const selectedFiles = useMemo(() => {
    const res: { groupId: string; file: ManifestFile }[] = []
    if (!manifest) return res
    for (const jump of manifest.jumps)
      for (const f of jump.files)
        if (selection[jump.id]?.[f.path]) res.push({ groupId: jump.id, file: f })
    for (const f of unassignedFiles)
      if (selection['unassigned']?.[f.path]) res.push({ groupId: 'unassigned', file: f })
    return res
  }, [manifest, selection, unassignedFiles])

  const selectedCount = selectedFiles.length
  const isSelectMode = selectedCount > 0

  const handleDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => {
      const selPaths = Object.values(selection).flatMap((g) => Object.keys(g))
      const toDrag =
        selPaths.length > 0 && filePaths.length === 1 && selPaths.includes(filePaths[0])
          ? selPaths
          : filePaths
      const finalPaths = toDrag
      dragDataRef.current = { filePaths: finalPaths, sourceJumpId }
      e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
      try {
        e.dataTransfer.setData('text/plain', finalPaths.join(','))
      } catch {}
    },
    [selection, copyMode]
  )

  const handleReorder = useCallback(
    (jumpId: string, filePaths: string[]) => {
      manifestSubmit({ action: 'reorder-files', jumpId, filePaths })
    },
    [manifestSubmit]
  )

  const handleTrayDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[]) => {
      const byGroup: Record<string, string[]> = {}
      for (const { groupId, file } of selectedFiles) {
        if (!filePaths.includes(file.path)) continue
        if (!byGroup[groupId]) byGroup[groupId] = []
        byGroup[groupId].push(file.path)
      }
      trayDragRef.current = { filePaths, sourceGroups: byGroup }
      e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
      e.dataTransfer.setData('text/x-staging-tray', 'true')
    },
    [copyMode, selectedFiles]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, targetJumpId: string) => {
      e.preventDefault()
      const trayData = trayDragRef.current
      if (trayData) {
        const { filePaths, sourceGroups } = trayData
        try {
          if (copyMode) {
            manifestSubmit({ action: 'copy-files', toJumpId: targetJumpId, filePaths })
          } else {
            for (const [sourceId, paths] of Object.entries(sourceGroups)) {
              if (sourceId === targetJumpId) continue
              const src = manifest?.jumps.find((j) => j.id === sourceId)
              if (src) {
                manifestSubmit({
                  action: 'move-files',
                  fromJumpId: sourceId,
                  toJumpId: targetJumpId,
                  filePaths: paths
                })
              } else {
                manifestSubmit({ action: 'copy-files', toJumpId: targetJumpId, filePaths: paths })
              }
            }
            setSelection({})
          }
        } finally {
          trayDragRef.current = null
          dragDataRef.current = null
        }
        return
      }
      const data = dragDataRef.current
      if (!data) return
      try {
        const sourceJumpId = data.sourceJumpId
        if (sourceJumpId === targetJumpId) return
        const sourceJump = manifest?.jumps.find((j) => j.id === sourceJumpId)
        if (sourceJump) {
          manifestSubmit({
            action: 'move-files',
            fromJumpId: sourceJumpId,
            toJumpId: targetJumpId,
            filePaths: data.filePaths
          })
        } else {
          manifestSubmit({
            action: 'copy-files',
            toJumpId: targetJumpId,
            filePaths: data.filePaths
          })
        }
        if (!copyMode) setSelection({})
      } finally {
        dragDataRef.current = null
        trayDragRef.current = null
      }
    },
    [manifestSubmit, manifest, copyMode]
  )

  const handleRemoveFiles = useCallback(
    (jumpId: string, filePaths: string[]) => {
      manifestSubmit({ action: 'remove-files', jumpId, filePaths })
    },
    [manifestSubmit]
  )

  const handleMerge = useCallback(
    (targetId: string, sourceId: string) => {
      manifestSubmit({
        action: 'merge-jumps',
        sourceJumpIds: [targetId, sourceId],
        targetJumpId: targetId
      })
    },
    [manifestSubmit]
  )

  const handleCompareToggle = useCallback((jumpId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(jumpId)) return prev.filter((id) => id !== jumpId)
      return [...prev, jumpId]
    })
  }, [])

  const compareJumps = useMemo(() => {
    if (compareIds.length !== 2 || !manifest) return null
    const a = manifest.jumps.find((j) => j.id === compareIds[0])
    const b = manifest.jumps.find((j) => j.id === compareIds[1])
    if (!a || !b) return null
    return [a, b] as [ManifestJump, ManifestJump]
  }, [compareIds, manifest])

  const handleShiftOffset = useCallback(
    (_dateOrId: string, offsetSeconds: number, paths: string[]) => {
      manifestSubmit({ action: 'shift-sequences', paths, offsetSeconds })
    },
    [manifestSubmit]
  )

  const handleShiftJump = useCallback(
    (jumpId: string, offsetSeconds: number, paths: string[]) => {
      void jumpId
      manifestSubmit({ action: 'shift-sequences', paths, offsetSeconds })
    },
    [manifestSubmit]
  )

  const handleSelectAll = () => {
    if (!manifest) return
    const ids = manifest.jumps.filter((j) => !j.processed).map((j) => j.id)
    setCompareIds(ids)
  }

  const handleCreateJump = () => {
    manifestSubmit({ action: 'create-jump' })
  }

  const handleResetCalibration = () => {
    manifestSubmit({ action: 'reset-calibration' })
  }

  const handleDeleteJump = useCallback(
    (jumpId: string) => {
      manifestSubmit({ action: 'delete-jump', jumpId })
    },
    [manifestSubmit]
  )

  const handleLabelSave = useCallback(
    (jumpId: string, label: string) => {
      manifestSubmit({ action: 'update-label', jumpId, label })
    },
    [manifestSubmit]
  )

  const handleUnprocess = useCallback(
    (jumpId: string) => {
      manifestSubmit({ action: 'unprocess-jump', jumpId })
    },
    [manifestSubmit]
  )

  const handleDeleteFile = useCallback(
    (jumpId: string, filePath: string) => {
      manifestSubmit({ action: 'remove-files', jumpId, filePaths: [filePath] })
    },
    [manifestSubmit]
  )

  const handleRenameFile = useCallback(
    (filePath: string, newFilename: string) => {
      manifestSubmit({ action: 'rename-file', filePath, newFilename })
    },
    [manifestSubmit]
  )

  const handlePreview = useCallback((files: ManifestFile[], index: number, label: string) => {
    setPreview({ files, index, label })
  }, [])
  const handlePreviewClose = useCallback(() => setPreview(null), [])
  const handlePreviewPrev = useCallback(() => {
    setPreview((p) => (p ? { ...p, index: (p.index - 1 + p.files.length) % p.files.length } : null))
  }, [])
  const handlePreviewNext = useCallback(() => {
    setPreview((p) => (p ? { ...p, index: (p.index + 1) % p.files.length } : null))
  }, [])

  const renderDashboard = () => (
    <>
      <header className='border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <div className='w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center'>
              <svg
                className='w-5 h-5 text-white'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z'
                />
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M15 13a3 3 0 11-6 0 3 3 0 016 0z'
                />
              </svg>
            </div>
            <NavLink to='/review'>
              <h1 className='text-xl font-bold text-gray-900 dark:text-white'>SkyDock</h1>
            </NavLink>
          </div>
          <div className='flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400'>
            <span>{totalJumps} jumps</span>
            <span>{totalPhotos} photos</span>
            <span>{totalVideos} videos</span>
            {import.meta.env.DEV && (
              <div className='flex items-center gap-2 ml-2'>
                <simulateFetcher.Form
                  method='post'
                  action='/api/simulate'>
                  <button
                    type='submit'
                    disabled={simulating}
                    className='px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition disabled:opacity-50 cursor-pointer'>
                    {simulating ? 'Resetting...' : 'Reset dev data'}
                  </button>
                </simulateFetcher.Form>
                <simulateFetcher.Form
                  method='post'
                  action='/api/simulate'>
                  <input
                    type='hidden'
                    name='action'
                    value='add-jump'
                  />
                  <button
                    type='submit'
                    disabled={simulating}
                    className='px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition disabled:opacity-50 cursor-pointer'>
                    {simulating ? 'Adding...' : 'Add Jump'}
                  </button>
                </simulateFetcher.Form>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className='max-w-7xl mx-auto px-6 py-6'>
        {effectiveDays.length === 0 ? (
          <div className='text-center py-20'>
            <div className='w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center'>
              <svg
                className='w-8 h-8 text-gray-400'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={1.5}>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
                />
              </svg>
            </div>
            <h2 className='text-lg font-semibold text-gray-900 dark:text-white mb-1'>
              No jumps yet
            </h2>
            <p className='text-gray-500 dark:text-gray-400'>
              Dock your cameras and let SkyDock process your footage.
            </p>
          </div>
        ) : (
          <div className='space-y-8'>
            {effectiveDays.map((day) => (
              <section key={day.date}>
                <div className='flex items-center gap-3 mb-4'>
                  <h2 className='text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                    {day.date}
                  </h2>
                  <div className='h-px flex-1 bg-gray-200 dark:bg-gray-800' />
                  <span className='text-xs text-gray-400 dark:text-gray-500'>
                    {day.jumps.length} jumps
                  </span>
                </div>
                <div className='grid grid-cols-2 gap-6'>
                  <div>
                    <div className='flex items-center gap-2 mb-3 px-1'>
                      <VideoIcon className='w-4 h-4 text-purple-500' />
                      <h3 className='text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                        Videos
                      </h3>
                    </div>
                    <div className='space-y-4'>
                      {day.jumps.map((jump) => (
                        <JumpColumn
                          key={`${jump.id}-video`}
                          jump={jump}
                          type='video'
                          onOpenFile={setOpenFile}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className='flex items-center gap-2 mb-3 px-1'>
                      <PhotoIcon className='w-4 h-4 text-blue-500' />
                      <h3 className='text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                        Photos
                      </h3>
                    </div>
                    <div className='space-y-4'>
                      {day.jumps.map((jump) => (
                        <JumpColumn
                          key={`${jump.id}-photo`}
                          jump={jump}
                          type='photo'
                          onOpenFile={setOpenFile}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      {openFile && (
        <FileDrawer
          file={openFile}
          onClose={() => setOpenFile(null)}
        />
      )}
    </>
  )

  const renderEmptyState = (title: string, description: string) => (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <div className='flex items-center justify-between mb-8'>
          <div>
            <h1 className='text-3xl font-bold'>{title}</h1>
            <p className='text-gray-500 mt-1'>{description}</p>
          </div>
          <div className='flex items-center gap-3'>
            <scanFetcher.Form
              method='post'
              action='/api/scan'>
              <button
                type='submit'
                disabled={scanning}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500'>
              Back to Dashboard
            </Link>
          </div>
        </div>
        {scanFetcher.data && !scanFetcher.data.ok && (
          <div className='mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700'>
            {(scanFetcher.data as { error: string }).error}
          </div>
        )}
      </div>
    </div>
  )

  const bothEmpty = effectiveDays.length === 0 && (!manifest || manifest.status === 'empty')
  if (fallbackShowDashboard && bothEmpty) {
    return renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')
  }
  if (showDashboard && !showReview && effectiveDays.length === 0) {
    // dashboard only, let renderDashboard handle empty
  } else if (showReview && !manifest) {
    return (
      <div>
        {(showDashboard || fallbackShowDashboard) && renderDashboard()}
        {renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')}
      </div>
    )
  } else if (showReview && manifest?.status === 'empty') {
    return (
      <div>
        {(showDashboard || fallbackShowDashboard) && renderDashboard()}
        {renderEmptyState('No Files to Review', 'No new camera files were found.')}
      </div>
    )
  }

  if (!showDashboard && !showReview) {
    if (!manifest)
      return renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')
    if (manifest.status === 'empty')
      return renderEmptyState('No Files to Review', 'No new camera files were found.')
  }

  const processedCount = manifest ? manifest.jumps.filter((j) => j.processed).length : 0
  const totalFiles = manifest ? manifest.jumps.reduce((s, j) => s + j.files.length, 0) : 0
  const anySystemRunning =
    isExecuteRunning || isProcessRunning || systemStatus?.scan.state === 'running'

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      {showDashboard && renderDashboard()}
      {!showDashboard && fallbackShowDashboard && effectiveDays.length > 0 && renderDashboard()}
      {showReview && manifest && manifest.status !== 'empty' && (
        <div className='max-w-7xl mx-auto px-6 py-6'>
          <div className='flex items-center justify-between mb-6'>
            <div>
              <div className='flex items-center gap-3'>
                <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
                {anySystemRunning && (
                  <span className='inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-700'>
                    <span className='w-2 h-2 rounded-full bg-amber-500 animate-pulse' />
                    Working…
                  </span>
                )}
              </div>
              <p className='text-gray-500 mt-1'>
                {manifest.date} — {manifest.jumps.length} jumps, {totalFiles} files
                {processedCount > 0 && (
                  <span className='ml-2 text-blue-600'>• {processedCount} processed</span>
                )}
                {hasCalibration && <span className='ml-2 text-amber-600'>• dates shifted</span>}
                {anySystemRunning && (
                  <span className='ml-2 text-amber-600'>• background tasks running</span>
                )}
              </p>
            </div>
            <div className='flex items-center gap-3'>
              <scanFetcher.Form
                method='post'
                action='/api/scan'>
                <button
                  type='submit'
                  disabled={scanning}
                  className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50'>
                  {scanning ? 'Scanning...' : 'Scan'}
                </button>
              </scanFetcher.Form>
              <Link
                to='/'
                className='text-gray-500'>
                Back to Dashboard
              </Link>
            </div>
          </div>
          {systemStatus && (
            <div className='space-y-2 mb-4'>
              {systemStatus.scan.state === 'running' && (
                <div className='flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200'>
                  <span className='w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0' />
                  <div className='flex-1'>
                    <span className='font-medium'>Scanning</span>
                    <span className='ml-2'>
                      {systemStatus.scan.message ||
                        'reading original_files and reclustering jumps…'}
                    </span>
                  </div>
                  <span className='text-xs text-blue-600 dark:text-blue-300'>
                    Jumps may reshuffle when done
                  </span>
                </div>
              )}
              {systemStatus.process.state === 'running' && (
                <div className='flex items-center gap-3 px-4 py-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 text-sm text-sky-800 dark:text-sky-200'>
                  <span className='w-4 h-4 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin shrink-0' />
                  <div className='flex-1'>
                    <span className='font-medium'>Copying from cameras</span>
                    <span className='ml-2'>
                      {systemStatus.process.message || 'copying to original_files…'}
                    </span>
                  </div>
                </div>
              )}
              {systemStatus.execute.state === 'running' && (
                <div className='flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-sm text-green-800 dark:text-green-200'>
                  <span className='w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin shrink-0' />
                  <div className='flex-1'>
                    <span className='font-medium'>Processing jumps</span>
                    <span className='ml-2'>
                      {systemStatus.execute.message || 'copying to processed/ with crops…'}
                    </span>
                  </div>
                </div>
              )}
              {(systemStatus.scan.state === 'done' ||
                systemStatus.execute.state === 'done' ||
                systemStatus.process.state === 'done') && (
                <div className='flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400'>
                  <span className='w-2 h-2 rounded-full bg-green-500' />
                  {[
                    systemStatus.scan.state === 'done' && `Scan: ${systemStatus.scan.message}`,
                    systemStatus.execute.state === 'done' &&
                      `Process: ${systemStatus.execute.message}`,
                    systemStatus.process.state === 'done' && `Copy: ${systemStatus.process.message}`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  <span className='ml-auto text-[11px] text-gray-400'>idle in 5s</span>
                </div>
              )}
            </div>
          )}

          <div className='flex items-center gap-3 mb-4'>
            <button
              type='button'
              onClick={handleSelectAll}
              className='px-4 py-2 text-sm font-medium bg-white border rounded-lg'>
              Select All
            </button>
            <button
              type='button'
              onClick={handleCreateJump}
              className='px-4 py-2 text-sm bg-white border rounded-lg'>
              + Add Jump
            </button>
            {hasCalibration && (
              <button
                type='button'
                onClick={handleResetCalibration}
                className='px-4 py-2 text-sm text-amber-700 border border-amber-300 rounded-lg bg-amber-50'>
                Reset dates
              </button>
            )}
          </div>

          <div className={`${selectedCount > 0 || compareIds.length > 0 ? 'flex gap-6' : ''}`}>
            {selectedCount > 0 && (
              <StagingTray
                selectedFiles={selectedFiles}
                copyMode={copyMode}
                setCopyMode={setCopyMode}
                onClear={() => setSelection({})}
                onRemove={(gid, fp) => handleSelect(gid, fp, true, false)}
                onDragStart={handleTrayDragStart}
              />
            )}
            <div className='flex-1 min-w-0'>
              <TimelineJumps
                dayGroups={jumpsByDay}
                selectedIds={compareIds}
                onSelect={handleCompareToggle}
                onShiftDay={handleShiftOffset}
              />

              {unassignedFiles.length > 0 && (
                <div className='mb-4 border border-amber-200 rounded-lg bg-amber-50 dark:bg-amber-900/10 p-3'>
                  <div className='flex items-center gap-2 mb-2'>
                    <span className='text-sm font-semibold text-amber-800 dark:text-amber-200'>
                      Unassigned files • {unassignedFiles.length}
                    </span>
                    <span className='text-xs text-amber-600 dark:text-amber-400'>
                      not in any jump — select to stage
                    </span>
                  </div>
                  <div className='space-y-0.5'>
                    {unassignedFiles.map((file, idx) => (
                      <FileRow
                        key={file.path}
                        file={file}
                        groupId='unassigned'
                        selected={!!selection['unassigned']?.[file.path]}
                        isSelectMode={isSelectMode}
                        isInMultipleJumps={multiJumpFiles.has(file.path)}
                        onSelect={handleSelect}
                        onDragStart={() => {}}
                        onPreview={() => handlePreview(unassignedFiles, idx, 'Unassigned')}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className='space-y-4'>
                {jumpsByDay.map((day) => (
                  <JumpDaySection
                    key={day.date}
                    day={day}
                    selection={selection}
                    isSelectMode={isSelectMode}
                    compareIds={compareIds}
                    multiJumpFiles={multiJumpFiles}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onSelect={handleSelect}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onRemoveFiles={handleRemoveFiles}
                    onPreview={handlePreview}
                    onReorder={handleReorder}
                    onCompareToggle={handleCompareToggle}
                    onDelete={handleDeleteJump}
                    onLabelSave={handleLabelSave}
                    onUnprocess={handleUnprocess}
                    onDeleteFile={handleDeleteFile}
                    onRenameFile={handleRenameFile}
                    onShiftJump={handleShiftJump}
                  />
                ))}
                {jumpsByDay.length === 0 && (
                  <p className='text-sm text-gray-400 italic'>No jumps — create one or fix dates</p>
                )}
              </div>
            </div>
            {compareIds.length > 0 && (
              <SelectedJumpsPanel
                jumps={compareIds
                  .map((id) => manifest!.jumps.find((j) => j.id === id)!)
                  .filter(Boolean)}
                onClear={() => setCompareIds([])}
                onCompare={() => setShowCompare(true)}
                onProcess={() => {
                  const ids = compareIds.filter((id) => {
                    const j = manifest!.jumps.find((x) => x.id === id)
                    return j && !j.processed
                  })
                  if (ids.length) {
                    manifestSubmit({ action: 'execute-jumps', jumpIds: ids })
                  }
                }}
                onChangeDay={(newDate) => {
                  for (const jumpId of compareIds) {
                    const jump = manifest!.jumps.find((j) => j.id === jumpId)
                    if (!jump || jump.files.length === 0) continue
                    const bounds = getJumpBounds(jump)
                    const parts = newDate.split('-')
                    const y = parseInt(parts[0], 10)
                    const m = parseInt(parts[1], 10) - 1
                    const d = parseInt(parts[2], 10)
                    const newNoon = Math.floor(new Date(y, m, d, 12, 0, 0).getTime() / 1000)
                    const oldStart = bounds.start
                    const oldNoon = Math.floor(
                      new Date(oldStart * 1000).setHours(12, 0, 0, 0) / 1000
                    )
                    const offset = newNoon - oldNoon
                    if (offset !== 0) {
                      const paths = jump.files.map((f) => f.path)
                      manifestSubmit({ action: 'shift-sequences', paths, offsetSeconds: offset })
                    }
                  }
                }}
              />
            )}
          </div>
          {preview && (
            <PreviewDrawer
              key={preview.files[preview.index]?.path ?? `${preview.index}`}
              preview={preview}
              onClose={handlePreviewClose}
              onPrev={handlePreviewPrev}
              onNext={handlePreviewNext}
            />
          )}
          {showCompare && compareJumps && (
            <CompareDrawer
              jumps={compareJumps}
              allJumps={manifest.jumps}
              compareIds={compareIds}
              onCompareIdsChange={setCompareIds}
              onClose={() => setShowCompare(false)}
              onMerge={(targetId, sourceId) => {
                handleMerge(targetId, sourceId)
                setShowCompare(false)
                setCompareIds([])
              }}
            />
          )}
        </div>
      )}
      {!showReview && fallbackShowDashboard && (
        <div className='max-w-7xl mx-auto px-6 py-6'>
          {effectiveDays.length === 0 ? (
            <div className='text-center py-20'>
              <div className='w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center'>
                <svg
                  className='w-8 h-8 text-gray-400'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  strokeWidth={1.5}>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
                  />
                </svg>
              </div>
              <h2 className='text-lg font-semibold text-gray-900 dark:text-white mb-1'>
                No jumps yet
              </h2>
              <p className='text-gray-500 dark:text-gray-400'>
                Dock your cameras and let SkyDock process your footage.
              </p>
            </div>
          ) : (
            <div className='space-y-8'>
              {effectiveDays.map((day) => (
                <section key={day.date}>
                  <div className='flex items-center gap-3 mb-4'>
                    <h2 className='text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                      {day.date}
                    </h2>
                    <div className='h-px flex-1 bg-gray-200 dark:bg-gray-800' />
                    <span className='text-xs text-gray-400 dark:text-gray-500'>
                      {day.jumps.length} jumps
                    </span>
                  </div>
                  <div className='grid grid-cols-2 gap-6'>
                    <div>
                      <div className='flex items-center gap-2 mb-3 px-1'>
                        <VideoIcon className='w-4 h-4 text-purple-500' />
                        <h3 className='text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                          Videos
                        </h3>
                      </div>
                      <div className='space-y-4'>
                        {day.jumps.map((jump) => (
                          <JumpColumn
                            key={`${jump.id}-video`}
                            jump={jump}
                            type='video'
                            onOpenFile={setOpenFile}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className='flex items-center gap-2 mb-3 px-1'>
                        <PhotoIcon className='w-4 h-4 text-blue-500' />
                        <h3 className='text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                          Photos
                        </h3>
                      </div>
                      <div className='space-y-4'>
                        {day.jumps.map((jump) => (
                          <JumpColumn
                            key={`${jump.id}-photo`}
                            jump={jump}
                            type='photo'
                            onOpenFile={setOpenFile}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
      {openFile && !showDashboard && !fallbackShowDashboard && (
        <FileDrawer
          file={openFile}
          onClose={() => setOpenFile(null)}
        />
      )}
    </div>
  )
}

export default Home
export { loader, meta }
