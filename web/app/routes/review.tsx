import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'
import { loadManifest } from '@skydock/scripts'
import type { ManifestFile, ManifestJump } from '../lib/types'
import type { SystemStatus } from '../lib/status.server'
import type { Route } from './+types/review'
import { CompareDrawer } from '../components/review/compare-drawer'
import { FileRow } from '../components/review/file-row'
import { JumpDaySection } from '../components/review/jump-day-section'
import { PreviewDrawer } from '../components/review/preview-drawer'
import { SelectedJumpsPanel } from '../components/review/selected-jumps-panel'
import { StagingTray } from '../components/review/staging-tray'
import { TimelineJumps } from '../components/review/timeline-jumps'
import type { PreviewState, SelectionMap } from '../components/review/types'
import { getJumpBounds, groupJumpsByDay } from '../components/review/utils'

const loader = async () => {
  const manifestPath = path.join(getOutputDirPath(), 'manifest.json')
  await ensureManifestFileIds(manifestPath)
  const manifest = loadManifest(manifestPath)
  return { manifest }
}

const Review = ({ loaderData }: Route.ComponentProps) => {
  const { manifest } = loaderData
  const manifestFetcher = useFetcher()
  const scanFetcher = useFetcher()
  const { revalidate } = useRevalidator()
  const [selection, setSelection] = useState<SelectionMap>({})
  const [lastClicked, setLastClicked] = useState<string | null>(null)
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

  useEffect(() => {
    if (manifestFetcher.data || scanFetcher.data) revalidate()
  }, [manifestFetcher.data, scanFetcher.data, revalidate])

  useEffect(() => {
    let cancelled = false
    const prevProxiesRunning = { current: false }
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status')
        const data = (await res.json()) as { ok: boolean; status: SystemStatus }
        if (cancelled || !data.ok) return
        const wasRunning = prevProxiesRunning.current
        const nowRunning = data.status.proxies.state === 'running'
        if (wasRunning && !nowRunning) revalidate()
        prevProxiesRunning.current = nowRunning
        setSystemStatus(data.status)
      } catch {}
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [revalidate])

  const scanning = scanFetcher.state !== 'idle' || systemStatus?.scan.state === 'running'
  const isProxiesRunning = systemStatus?.proxies.state === 'running'
  const processingFiles = useMemo(() => {
    if (!manifest || !systemStatus?.proxies.processing?.length) return []
    const idToFilename = new Map<string, string>()
    for (const f of manifest.files) if (f.id) idToFilename.set(f.id, f.filename)
    for (const j of manifest.jumps)
      for (const f of j.files) if (f.id) idToFilename.set(f.id, f.filename)
    return systemStatus.proxies.processing.map((id) => idToFilename.get(id) ?? id).slice(0, 4)
  }, [manifest, systemStatus])
  const isExecuteRunning = systemStatus?.execute.state === 'running'
  const isProcessRunning = systemStatus?.process.state === 'running'

  const manifestSubmit = useCallback(
    (body: Record<string, string | number | boolean | string[]>) => {
      manifestFetcher.submit(body, {
        method: 'POST',
        encType: 'application/json',
        action: '/api/manifest'
      })
    },
    [manifestFetcher]
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
      setSelection((prev) => {
        const next: SelectionMap = {}
        for (const [k, v] of Object.entries(prev)) next[k] = { ...v }
        if (!next[groupId]) next[groupId] = {}
        else next[groupId] = { ...next[groupId] }
        if (shiftKey && lastClicked) {
          const sIdx = allFileIds.indexOf(lastClicked)
          const eIdx = allFileIds.indexOf(filePath)
          if (sIdx !== -1 && eIdx !== -1) {
            const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
            for (let i = from; i <= to; i++) {
              const id = allFileIds[i]
              for (const jid of Object.keys(next)) {
                if (next[jid][id]) {
                  next[jid] = { ...next[jid] }
                  delete next[jid][id]
                }
              }
              if (!next[groupId]) next[groupId] = {}
              else if (!next[groupId][id]) next[groupId] = { ...next[groupId] }
              next[groupId][id] = true
            }
          }
        } else if (next[groupId][filePath]) {
          const g = { ...next[groupId] }
          delete g[filePath]
          next[groupId] = g
          if (Object.keys(g).length === 0) delete next[groupId]
        } else {
          next[groupId] = { ...next[groupId], [filePath]: true }
        }
        setLastClicked(filePath)
        return next
      })
    },
    [lastClicked, allFileIds]
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
      dragDataRef.current = { filePaths, sourceJumpId }
      e.dataTransfer.effectAllowed = 'move'
    },
    []
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
      } finally {
        dragDataRef.current = null
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

  const renderEmptyState = (title: string, description: string) => {
    const scanError = scanFetcher.data && !scanFetcher.data.ok ? scanFetcher.data.error : null
    return (
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
          {scanError && (
            <div className='mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700'>
              {scanError}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!manifest)
    return renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')
  if (manifest.status === 'empty')
    return renderEmptyState('No Files to Review', 'No new camera files were found.')

  const processedCount = manifest.jumps.filter((j) => j.processed).length
  const totalFiles = manifest.jumps.reduce((s, j) => s + j.files.length, 0)

  const anySystemRunning =
    isProxiesRunning ||
    isExecuteRunning ||
    isProcessRunning ||
    systemStatus?.scan.state === 'running'

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
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
            {systemStatus.proxies.state === 'running' && (
              <div className='flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-200'>
                <span className='w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin shrink-0' />
                <div className='flex-1 min-w-0'>
                  <span className='font-medium'>Generating proxies</span>
                  <span className='ml-2 text-amber-700 dark:text-amber-300'>
                    {systemStatus.proxies.total != null && systemStatus.proxies.done != null
                      ? `${systemStatus.proxies.done}/${systemStatus.proxies.total} videos`
                      : 'thumbnails and 480p proxies'}
                    {' — '}
                    {systemStatus.proxies.message ||
                      'thumbnails and previews will appear when ready'}
                  </span>
                  {processingFiles.length > 0 && (
                    <span className='ml-2 text-xs font-mono text-amber-700 dark:text-amber-300 truncate max-w-[320px]'>
                      · enc: {processingFiles.join(', ')}
                      {systemStatus.proxies.processing &&
                      systemStatus.proxies.processing.length > processingFiles.length
                        ? ` +${systemStatus.proxies.processing.length - processingFiles.length}`
                        : ''}
                    </span>
                  )}
                  <span className='ml-2 text-xs text-amber-600 dark:text-amber-400'>
                    · grid uses thumbPath when ready, preview falls back to original
                  </span>
                </div>
                <span className='text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700'>
                  Proxy
                </span>
              </div>
            )}
            {systemStatus.scan.state === 'running' && (
              <div className='flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200'>
                <span className='w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0' />
                <div className='flex-1'>
                  <span className='font-medium'>Scanning</span>
                  <span className='ml-2'>
                    {systemStatus.scan.message || 'reading original_files and reclustering jumps…'}
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
            {(systemStatus.proxies.state === 'done' ||
              systemStatus.scan.state === 'done' ||
              systemStatus.execute.state === 'done' ||
              systemStatus.process.state === 'done') && (
              <div className='flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400'>
                <span className='w-2 h-2 rounded-full bg-green-500' />
                {[
                  systemStatus.proxies.state === 'done' &&
                    `Proxies: ${systemStatus.proxies.message}`,
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
                  const oldNoon = Math.floor(new Date(oldStart * 1000).setHours(12, 0, 0, 0) / 1000)
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
    </div>
  )
}

export default Review
export { loader }
