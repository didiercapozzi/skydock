import { loadManifest } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ComparisonDialog } from '../components/comparison-dialog'
import { DropActionDialog } from '../components/drop-action-dialog'
import { FileRow } from '../components/file-row'
import { JumpCard } from '../components/jump-card'
import { PreviewDrawer } from '../components/preview-drawer'
import type { VideoRef } from '../components/preview-drawer'
import { StagingTray } from '../components/staging-tray'
import type {
  DragData,
  DropDialog,
  DropHint,
  ManifestFile,
  ManifestJump,
  PreviewState,
  SelectionMap
} from '../components/types'
import { getDropIndex, groupJumpsByDay } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'
import type { Route } from './+types/home'

const loader = ({}: Route.LoaderArgs) => {
  const outputDir = process.env.SKYDOCK_OUTPUT_DIR ?? '/workspace/output'
  try {
    return { manifest: loadManifest(`${outputDir}/manifest.json`) }
  } catch {
    return { manifest: null }
  }
}

const Home = ({ loaderData }: Route.ComponentProps) => {
  const manifest = loaderData.manifest
  const [selection, setSelection] = useState<SelectionMap>({})
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [dropDialog, setDropDialog] = useState<DropDialog | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [preview, setPreview] = useState<PreviewState>(null)
  const [jumps, setJumps] = useState<ManifestJump[]>(manifest?.jumps ?? [])
  const lastClickedRef = useRef<string | null>(null)
  const dragDataRef = useRef<DragData | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const videoRefRef = useRef<VideoRef | null>(null)
  const { submit } = useSafeFetcher()
  const jumpsByDay = groupJumpsByDay(jumps)
  const [videoCrop, setVideoCrop] = useState<{ cropStart: number | null; cropEnd: number | null }>({
    cropStart: null,
    cropEnd: null
  })
  const [videoZoom, setVideoZoom] = useState(1)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)

  const saveJumps = (next: ManifestJump[]) => {
    submit({
      url: '/api/manifest',
      actionArgs: { intent: 'save-jumps', jumps: next }
    })
  }

  const handleVideoSeek = (time: number) => {
    setVideoCurrentTime(time)
    videoRefRef.current?.seek(time)
  }

  const handleVideoApply = (range: { cropStart: number | null; cropEnd: number | null }) => {
    if (!preview) return
    const file = preview.files[preview.index]
    if (!file) return
    const next = jumps.map((j) => ({
      ...j,
      files: j.files.map((f) =>
        f.path === file.path ? { ...f, cropStart: range.cropStart, cropEnd: range.cropEnd } : f
      )
    }))
    setJumps(next)
    saveJumps(next)
    setVideoCrop(range)
  }

  const handleVideoRef = (ref: VideoRef) => {
    videoRefRef.current = ref
  }

  useEffect(() => {
    mainRef.current?.setAttribute('data-hydrated', 'true')
  }, [])

  const manifestFiles = manifest?.files ?? []
  const filesInJumps = new Set(jumps.flatMap((j) => j.files.map((f) => f.path)))
  const unassignedFiles = manifestFiles.filter((f) => !filesInJumps.has(f.path))

  const selectedCount = Object.values(selection).reduce(
    (sum, group) => sum + Object.keys(group).length,
    0
  )

  const handleSelect = (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
    const prevLast = lastClickedRef.current
    lastClickedRef.current = filePath

    setSelection((prev) => {
      const next: SelectionMap = {}
      for (const [k, v] of Object.entries(prev)) next[k] = { ...v }

      if (shiftKey && prevLast) {
        const allPaths = [
          ...unassignedFiles.map((f) => f.path),
          ...jumps.flatMap((j) => j.files.map((f) => f.path))
        ]
        const sIdx = allPaths.indexOf(prevLast)
        const eIdx = allPaths.indexOf(filePath)
        if (sIdx !== -1 && eIdx !== -1) {
          const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
          for (let i = from; i <= to; i++) {
            const p = allPaths[i]
            const gid = unassignedFiles.some((f) => f.path === p)
              ? 'unassigned'
              : (jumps.find((j) => j.files.some((f) => f.path === p))?.id ?? groupId)
            if (!next[gid]) next[gid] = {}
            else next[gid] = { ...next[gid] }
            next[gid][p] = true
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

      if (!ctrlKey && Object.keys(next[groupId] ?? {}).length > 0) {
        for (const k of Object.keys(next)) {
          if (k !== groupId) delete next[k]
        }
      }

      return next
    })
  }

  const handleCompareToggle = (jumpId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(jumpId)) return prev.filter((id) => id !== jumpId)
      if (prev.length >= 2) return prev
      return [...prev, jumpId]
    })
  }

  const handlePreview = (file: ManifestFile, groupId: string) => {
    const files =
      groupId === 'unassigned'
        ? unassignedFiles
        : (jumps.find((j) => j.id === groupId)?.files ?? [file])
    const found = files.findIndex((f) => f.path === file.path)
    setVideoCrop({ cropStart: file.cropStart ?? null, cropEnd: file.cropEnd ?? null })
    setVideoCurrentTime(0)
    setVideoDuration(0)
    setPreview({ files, index: found === -1 ? 0 : found, groupId })
  }

  const handleDragStart = (e: React.DragEvent, groupId: string, paths: string[]) => {
    const selectedPaths = selection[groupId] ? Object.keys(selection[groupId]) : paths
    dragDataRef.current = { groups: { [groupId]: selectedPaths } }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(selectedPaths))
  }

  const handleTrayDragStart = (e: React.DragEvent) => {
    const groups: Record<string, string[]> = {}
    for (const [groupId, files] of Object.entries(selection)) {
      groups[groupId] = Object.keys(files)
    }
    const allPaths = Object.values(groups).flat()
    dragDataRef.current = { groups }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(allPaths))
  }

  const handleDrop = (e: React.DragEvent, targetJumpId: string) => {
    const data = dragDataRef.current
    if (!data) return
    dragDataRef.current = null
    setDropHint(null)

    const groupIds = Object.keys(data.groups)
    if (groupIds.length === 1 && groupIds[0] === targetJumpId) {
      const toIndex = getDropIndex(e.currentTarget as HTMLElement, e.clientY)
      const paths = data.groups[targetJumpId]
      const next = jumps.map((j) => {
        if (j.id !== targetJumpId) return j
        const moved = j.files.filter((f) => paths.includes(f.path))
        if (moved.length === 0) return j
        const remaining = j.files.filter((f) => !paths.includes(f.path))
        const draggedBefore = j.files.slice(0, toIndex).filter((f) => paths.includes(f.path)).length
        const insertAt = Math.max(0, toIndex - draggedBefore)
        return {
          ...j,
          files: [...remaining.slice(0, insertAt), ...moved, ...remaining.slice(insertAt)]
        }
      })
      setJumps(next)
      saveJumps(next)
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    setDropDialog({
      x: e.clientX - rect.left + rect.left,
      y: e.clientY,
      groups: data.groups,
      targetJumpId
    })
  }

  const handleDragOver = (e: React.DragEvent, targetJumpId: string) => {
    const index = getDropIndex(e.currentTarget as HTMLElement, e.clientY)
    setDropHint((prev) =>
      prev && prev.jumpId === targetJumpId && prev.index === index
        ? prev
        : { jumpId: targetJumpId, index }
    )
  }

  const handleDragLeave = () => {
    setDropHint(null)
  }

  const handleDragEnd = () => {
    dragDataRef.current = null
    setDropHint(null)
  }

  const executeDrop = (action: 'move' | 'copy') => {
    if (!dropDialog) return
    const { groups, targetJumpId } = dropDialog
    const lookup = new Map<string, ManifestFile>()
    for (const f of manifestFiles) lookup.set(f.path, f)
    for (const j of jumps) for (const f of j.files) lookup.set(f.path, f)
    const allPaths = Object.values(groups).flat()
    const next = jumps.map((j) => {
      const sourcePaths = groups[j.id]
      let files =
        sourcePaths && action === 'move'
          ? j.files.filter((f) => !sourcePaths.includes(f.path))
          : j.files
      if (j.id === targetJumpId) {
        const additions: ManifestFile[] = []
        for (const p of allPaths) {
          const f = lookup.get(p)
          if (f && !files.some((x) => x.path === f.path)) additions.push(f)
        }
        files = [...files, ...additions]
      }
      return files === j.files ? j : { ...j, files }
    })
    setJumps(next)
    setSelection({})
    setDropDialog(null)
    saveJumps(next)
  }

  if (!loaderData.manifest) {
    return (
      <main className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
        <div className='max-w-7xl mx-auto px-6 py-8'>
          <h1 className='text-3xl font-bold text-gray-900'>No Manifest Found</h1>
          <p className='text-gray-500 mt-2'>Run a scan to generate the manifest.</p>
        </div>
      </main>
    )
  }

  return (
    <main
      ref={mainRef}
      data-hydrated='false'
      className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
      <header className='border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40'>
        <div className='max-w-7xl mx-auto px-6 py-4 flex items-center justify-between'>
          <Link
            to='/'
            className='flex items-center gap-2 group'>
            <div className='w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow'>
              <svg
                className='w-5 h-5 text-white'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5'
                />
              </svg>
            </div>
            <h1 className='text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors'>
              SkyDock
            </h1>
          </Link>
          <div className='flex items-center gap-4'>
            <button
              type='button'
              disabled
              className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg opacity-50 cursor-not-allowed shadow-sm'>
              Scan
            </button>
          </div>
        </div>
      </header>

      <div className='max-w-7xl mx-auto px-6 py-8'>
        <div className='flex items-center justify-between mb-8'>
          <div>
            <h1 className='text-3xl font-bold text-gray-900'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-2'>
              2026-08-24 — {jumps.length} jumps, {manifestFiles.length} files
            </p>
          </div>
          {compareIds.length > 0 && (
            <div className='flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2'>
              <span className='text-sm font-medium text-blue-700'>
                {compareIds.length} jump{compareIds.length !== 1 ? 's' : ''} selected
              </span>
              <button
                type='button'
                onClick={() => setCompareIds([])}
                className='text-xs text-blue-600 hover:text-blue-800 font-medium'>
                Clear
              </button>
              {compareIds.length === 2 && (
                <button
                  type='button'
                  onClick={() => setShowComparison(true)}
                  className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'>
                  Compare
                </button>
              )}
            </div>
          )}
        </div>

        <div className='text-sm text-gray-500 mb-6 flex items-center gap-2'>
          <svg
            className='w-4 h-4'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={1.5}>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z'
            />
          </svg>
          Review workspace — jumps grouped by day
        </div>

        {unassignedFiles.length > 0 && (
          <div className='mb-6 border border-amber-200 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm'>
            <div className='flex items-center gap-2 mb-3'>
              <div className='w-2 h-2 rounded-full bg-amber-500 animate-pulse' />
              <span className='text-sm font-semibold text-amber-800'>
                Unassigned files • {unassignedFiles.length}
              </span>
              <span className='text-xs text-amber-600'>— not in any jump, select to stage</span>
            </div>
            <div className='space-y-1'>
              {unassignedFiles.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  groupId='unassigned'
                  selected={!!selection['unassigned']?.[file.path]}
                  isPreviewed={preview?.files[preview.index]?.path === file.path}
                  isInMultipleJumps={false}
                  onSelect={handleSelect}
                  onPreview={handlePreview}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        )}

        <div className='space-y-8'>
          {jumpsByDay.map((day) => (
            <section key={day.date}>
              <div className='flex items-center gap-4 mb-4'>
                <h2 className='text-sm font-bold text-gray-600 uppercase tracking-wider'>
                  {day.date}
                </h2>
                <div className='h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent' />
                <span className='text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full'>
                  {day.jumps.length} jump{day.jumps.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className='space-y-4'>
                {day.jumps.map((jump) => (
                  <div
                    key={jump.id}
                    className={`relative rounded-xl transition-all duration-200 ${
                      compareIds.includes(jump.id)
                        ? 'ring-2 ring-blue-500 shadow-lg'
                        : 'hover:shadow-md'
                    }`}>
                    <div className='absolute top-3 right-3 z-10'>
                      <input
                        type='checkbox'
                        checked={compareIds.includes(jump.id)}
                        onChange={() => handleCompareToggle(jump.id)}
                        className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                        title='Select for comparison'
                      />
                    </div>
                    <JumpCard
                      jump={jump}
                      selection={selection}
                      previewedPath={preview?.files[preview.index]?.path ?? null}
                      dropIndex={dropHint && dropHint.jumpId === jump.id ? dropHint.index : null}
                      onSelect={handleSelect}
                      onPreview={handlePreview}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {selectedCount > 0 && (
          <StagingTray
            selectedCount={selectedCount}
            onClear={() => setSelection({})}
            onDragStart={handleTrayDragStart}
          />
        )}

        {preview && preview.files[preview.index] && (
          <PreviewDrawer
            files={preview.files}
            index={preview.index}
            onClose={() => {
              videoRefRef.current = null
              setPreview(null)
            }}
            onPrevious={() =>
              setPreview((p) => (p ? { ...p, index: Math.max(0, p.index - 1) } : p))
            }
            onNext={() =>
              setPreview((p) =>
                p ? { ...p, index: Math.min(p.files.length - 1, p.index + 1) } : p
              )
            }
            cropStart={videoCrop.cropStart}
            cropEnd={videoCrop.cropEnd}
            zoom={videoZoom}
            currentTime={videoCurrentTime}
            duration={videoDuration || 10}
            onSeek={handleVideoSeek}
            onCropChange={setVideoCrop}
            onApply={handleVideoApply}
            onZoomChange={setVideoZoom}
            onDurationChange={setVideoDuration}
            onVideoRef={handleVideoRef}
          />
        )}

        {dropDialog && (
          <DropActionDialog
            x={dropDialog.x}
            y={dropDialog.y}
            onMove={() => executeDrop('move')}
            onCopy={() => executeDrop('copy')}
            onCancel={() => setDropDialog(null)}
          />
        )}

        {showComparison && compareIds.length === 2 && (
          <ComparisonDialog
            jumps={jumps}
            leftJumpId={compareIds[0]}
            rightJumpId={compareIds[1]}
            onClose={() => setShowComparison(false)}
            onMerge={() => {}}
          />
        )}
      </div>
    </main>
  )
}

export { loader }

export default Home
