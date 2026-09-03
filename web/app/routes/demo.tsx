import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router'

type ManifestFile = {
  path: string
  size: number
  mtime: number
  filename: string
  id: string
  originalMtime?: number
}

type ManifestJump = {
  id: string
  label: string
  confirmed: boolean
  files: ManifestFile[]
  processed?: boolean
}

type SelectionMap = Record<string, Record<string, boolean>>

const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'mts', 'm4v', '3gp'])

const isVideoFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTS.has(ext)
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

const getJumpBounds = (jump: ManifestJump) => {
  if (jump.files.length === 0) return { start: 0, end: 0 }
  const times = jump.files.map((f) => f.mtime)
  return { start: Math.min(...times), end: Math.max(...times) }
}

const getJumpDate = (jump: ManifestJump) => {
  if (jump.files.length === 0) return ''
  const min = Math.min(...jump.files.map((f) => f.mtime))
  return new Date(min * 1000).toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

const baseTime = Math.floor(Date.now() / 1000) - 86400

const fakeFiles: ManifestFile[] = [
  {
    path: '/demo/DJI_0001.MP4',
    size: 245_000_000,
    mtime: baseTime + 33125,
    filename: 'DJI_0001.MP4',
    id: 'a'.repeat(16)
  },
  {
    path: '/demo/DJI_0002.MP4',
    size: 198_700_000,
    mtime: baseTime + 33333,
    filename: 'DJI_0002.MP4',
    id: 'b'.repeat(16)
  },
  {
    path: '/demo/DJI_0003.JPG',
    size: 9_400_000,
    mtime: baseTime + 33361,
    filename: 'DJI_0003.JPG',
    id: 'c'.repeat(16)
  },
  {
    path: '/demo/DJI_0004.MP4',
    size: 312_500_000,
    mtime: baseTime + 36131,
    filename: 'DJI_0004.MP4',
    id: 'd'.repeat(16)
  },
  {
    path: '/demo/DJI_0005.MP4',
    size: 287_300_000,
    mtime: baseTime + 36347,
    filename: 'DJI_0005.MP4',
    id: 'e'.repeat(16)
  },
  {
    path: '/demo/DJI_0006.JPG',
    size: 8_200_000,
    mtime: baseTime + 36361,
    filename: 'DJI_0006.JPG',
    id: 'f'.repeat(16)
  },
  {
    path: '/demo/DJI_0007.MP4',
    size: 156_800_000,
    mtime: baseTime + 41422,
    filename: 'DJI_0007.MP4',
    id: 'g'.repeat(16)
  },
  {
    path: '/demo/DJI_0008.MP4',
    size: 203_100_000,
    mtime: baseTime + 41625,
    filename: 'DJI_0008.MP4',
    id: 'h'.repeat(16)
  },
  {
    path: '/demo/DJI_0009.JPG',
    size: 7_900_000,
    mtime: baseTime + 41641,
    filename: 'DJI_0009.JPG',
    id: 'i'.repeat(16)
  },
  {
    path: '/demo/DJI_0010.MP4',
    size: 178_400_000,
    mtime: baseTime + 41838,
    filename: 'DJI_0010.MP4',
    id: 'j'.repeat(16)
  },
  {
    path: '/demo/DJI_0011.JPG',
    size: 8_100_000,
    mtime: baseTime + 41875,
    filename: 'DJI_0011.JPG',
    id: 'k'.repeat(16)
  },
  {
    path: '/demo/DJI_0012.MP4',
    size: 142_200_000,
    mtime: baseTime + 55822,
    filename: 'DJI_0012.MP4',
    id: 'l'.repeat(16)
  },
  {
    path: '/demo/DJI_0013.MP4',
    size: 98_500_000,
    mtime: baseTime + 56100,
    filename: 'DJI_0013.MP4',
    id: 'm'.repeat(16)
  },
  {
    path: '/demo/DJI_0014.JPG',
    size: 6_800_000,
    mtime: baseTime + 56200,
    filename: 'DJI_0014.JPG',
    id: 'n'.repeat(16)
  }
]

const fakeJumps: ManifestJump[] = [
  {
    id: 'jump_1',
    label: 'Jump 1 — Tandem',
    confirmed: false,
    files: [fakeFiles[0], fakeFiles[1], fakeFiles[2]]
  },
  {
    id: 'jump_2',
    label: 'Jump 2 — Solo',
    confirmed: false,
    files: [fakeFiles[3], fakeFiles[4], fakeFiles[5]]
  },
  {
    id: 'jump_3',
    label: 'Jump 3 — Tandem',
    confirmed: false,
    files: [fakeFiles[6], fakeFiles[7], fakeFiles[8], fakeFiles[9], fakeFiles[10]]
  },
  {
    id: 'jump_4',
    label: 'Jump 4 — Video',
    confirmed: false,
    files: [fakeFiles[11]]
  }
]

type JumpDayGroup = {
  date: string
  jumps: ManifestJump[]
}

const groupJumpsByDay = (jumps: ManifestJump[]): JumpDayGroup[] => {
  const map = new Map<string, JumpDayGroup>()
  for (const jump of jumps) {
    const date = getJumpDate(jump) || 'Unknown'
    const g = map.get(date)
    if (g) g.jumps.push(jump)
    else map.set(date, { date, jumps: [jump] })
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.jumps[0] ? getJumpBounds(a.jumps[0]).start : 0
    const tb = b.jumps[0] ? getJumpBounds(b.jumps[0]).start : 0
    return tb - ta
  })
}

const VideoIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    strokeWidth={1.5}>
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z'
    />
  </svg>
)

const PhotoIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    strokeWidth={1.5}>
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z'
    />
  </svg>
)

const FileRow = ({
  file,
  groupId,
  selected,
  isInMultipleJumps,
  onSelect
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  isInMultipleJumps: boolean
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
}) => (
  <div
    data-file-row='true'
    draggable
    onClick={(e) => onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)}
    className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer select-none transition-all duration-150 ${
      selected
        ? 'bg-blue-50 ring-1 ring-blue-400 shadow-sm'
        : isInMultipleJumps
          ? 'bg-purple-50 hover:bg-purple-100 border border-purple-200'
          : 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
    }`}>
    <input
      type='checkbox'
      checked={selected}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(groupId, file.path, true, false)
      }}
      className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
    />
    <div
      className={`p-1 rounded ${isVideoFile(file.filename) ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
      {isVideoFile(file.filename) ? (
        <VideoIcon className='w-3.5 h-3.5' />
      ) : (
        <PhotoIcon className='w-3.5 h-3.5' />
      )}
    </div>
    <span className='font-mono truncate flex-1 text-xs text-gray-700'>{file.filename}</span>
    <span className='text-gray-400 text-xs tabular-nums font-medium'>{formatTime(file.mtime)}</span>
    <span className='text-gray-400 text-xs tabular-nums'>{formatSize(file.size)}</span>
  </div>
)

const JumpCard = ({
  jump,
  selection,
  onSelect
}: {
  jump: ManifestJump
  selection: SelectionMap
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
}) => {
  const bounds = getJumpBounds(jump)
  const videoCount = jump.files.filter((f) => isVideoFile(f.filename)).length
  const photoCount = jump.files.length - videoCount

  return (
    <div
      data-jump-card='true'
      className='border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden'>
      <div className='px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <h3 className='font-semibold text-sm text-gray-800'>{jump.label}</h3>
            <div className='flex items-center gap-1.5'>
              {videoCount > 0 && (
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700'>
                  <VideoIcon className='w-3 h-3' />
                  {videoCount}
                </span>
              )}
              {photoCount > 0 && (
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700'>
                  <PhotoIcon className='w-3 h-3' />
                  {photoCount}
                </span>
              )}
            </div>
          </div>
          <div className='flex items-center gap-4 text-xs text-gray-500'>
            <span className='tabular-nums font-medium'>
              {formatTime(bounds.start)} — {formatTime(bounds.end)}
            </span>
            <span className='px-2 py-0.5 rounded-full bg-gray-100 text-gray-600'>
              {jump.files.length} files
            </span>
          </div>
        </div>
      </div>
      <div className='divide-y divide-gray-50'>
        {jump.files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            groupId={jump.id}
            selected={!!selection[jump.id]?.[file.path]}
            isInMultipleJumps={false}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

const Demo = () => {
  const [selection, setSelection] = useState<SelectionMap>({})
  const [compareIds, setCompareIds] = useState<string[]>([])
  const lastClickedRef = useRef<string | null>(null)
  const jumpsByDay = groupJumpsByDay(fakeJumps)

  const filesInJumps = new Set(fakeJumps.flatMap((j) => j.files.map((f) => f.path)))
  const unassignedFiles = fakeFiles.filter((f) => !filesInJumps.has(f.path))

  const selectedCount = Object.values(selection).reduce(
    (sum, group) => sum + Object.keys(group).length,
    0
  )

  const handleSelect = useCallback(
    (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
      const prevLast = lastClickedRef.current
      lastClickedRef.current = filePath

      setSelection((prev) => {
        const next: SelectionMap = {}
        for (const [k, v] of Object.entries(prev)) next[k] = { ...v }

        if (shiftKey && prevLast) {
          const allPaths = [
            ...unassignedFiles.map((f) => f.path),
            ...fakeJumps.flatMap((j) => j.files.map((f) => f.path))
          ]
          const sIdx = allPaths.indexOf(prevLast)
          const eIdx = allPaths.indexOf(filePath)
          if (sIdx !== -1 && eIdx !== -1) {
            const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
            for (let i = from; i <= to; i++) {
              const p = allPaths[i]
              const gid = unassignedFiles.some((f) => f.path === p)
                ? 'unassigned'
                : (fakeJumps.find((j) => j.files.some((f) => f.path === p))?.id ?? groupId)
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
    },
    [unassignedFiles]
  )

  const handleCompareToggle = useCallback((jumpId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(jumpId)) return prev.filter((id) => id !== jumpId)
      if (prev.length >= 2) return prev
      return [...prev, jumpId]
    })
  }, [])

  return (
    <main className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
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
            <span className='text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200'>
              DEMO MODE
            </span>
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
              2026-08-24 — {fakeJumps.length} jumps, {fakeFiles.length} files
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
                  isInMultipleJumps={false}
                  onSelect={handleSelect}
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
                      onSelect={handleSelect}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {selectedCount > 0 && (
          <div
            data-staging-tray='true'
            className='fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur-sm p-4 shadow-2xl z-50'>
            <div className='max-w-7xl mx-auto flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <div className='w-2 h-2 rounded-full bg-blue-500 animate-pulse' />
                <span className='text-sm font-semibold text-gray-800'>
                  {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
                </span>
              </div>
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  onClick={() => setSelection({})}
                  className='px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'>
                  Clear
                </button>
                <div className='flex items-center gap-2 bg-gray-100 rounded-lg p-1'>
                  <button
                    type='button'
                    className='px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm'>
                    Move
                  </button>
                  <button
                    type='button'
                    className='px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-white rounded-md transition-colors'>
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default Demo
