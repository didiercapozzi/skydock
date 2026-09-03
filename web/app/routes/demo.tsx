import { useState } from 'react'
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

const FileRow = ({
  file,
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
    onClick={(e) => onSelect('demo', file.path, e.ctrlKey || e.metaKey, e.shiftKey)}
    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer select-none ${
      selected
        ? 'bg-blue-100 ring-1 ring-blue-300'
        : isInMultipleJumps
          ? 'bg-purple-50 hover:bg-purple-100'
          : 'hover:bg-gray-100'
    }`}>
    <input
      type='checkbox'
      checked={selected}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation()
        onSelect('demo', file.path, true, false)
      }}
      className='h-4 w-4 rounded border-gray-300 text-blue-600'
    />
    <span className='font-mono truncate flex-1 text-xs text-gray-700'>{file.filename}</span>
    <span className='text-gray-400 text-xs tabular-nums'>{formatTime(file.mtime)}</span>
    <span className='text-gray-400 text-xs'>{formatSize(file.size)}</span>
  </div>
)

const Demo = () => {
  const [selection, setSelection] = useState<SelectionMap>({})
  const jumpsByDay = groupJumpsByDay(fakeJumps)

  const filesInJumps = new Set(fakeJumps.flatMap((j) => j.files.map((f) => f.path)))
  const unassignedFiles = fakeFiles.filter((f) => !filesInJumps.has(f.path))
  const multiJumpFiles = new Set<string>()

  const selectedCount = Object.values(selection).reduce(
    (sum, group) => sum + Object.keys(group).length,
    0
  )

  const handleSelect = (
    groupId: string,
    filePath: string,
    ctrlKey: boolean,
    _shiftKey: boolean
  ) => {
    setSelection((prev) => {
      const next: SelectionMap = {}
      for (const [k, v] of Object.entries(prev)) next[k] = { ...v }
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

  return (
    <main className='min-h-screen bg-gray-50'>
      <header className='border-b bg-white'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex items-center justify-between'>
          <Link to='/'>
            <h1 className='text-xl font-bold'>SkyDock</h1>
          </Link>
          <div className='flex items-center gap-3'>
            <span className='text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded'>DEMO MODE</span>
            <button
              type='button'
              disabled
              className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg opacity-50 cursor-not-allowed'>
              Scan
            </button>
          </div>
        </div>
      </header>
      <div className='max-w-7xl mx-auto px-6 py-6'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-1'>
              2026-08-24 — {fakeJumps.length} jumps, {fakeFiles.length} files
            </p>
          </div>
        </div>
        <div className='text-sm text-gray-500 mb-4'>Review workspace — jumps grouped by day</div>

        {unassignedFiles.length > 0 && (
          <div className='mb-4 border border-amber-200 rounded-lg bg-amber-50 p-3'>
            <div className='flex items-center gap-2 mb-2'>
              <span className='text-sm font-semibold text-amber-800'>
                Unassigned files • {unassignedFiles.length}
              </span>
              <span className='text-xs text-amber-600'>not in any jump — select to stage</span>
            </div>
            <div className='space-y-0.5'>
              {unassignedFiles.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  groupId='unassigned'
                  selected={!!selection['unassigned']?.[file.path]}
                  isInMultipleJumps={multiJumpFiles.has(file.path)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        )}

        <div className='space-y-6'>
          {jumpsByDay.map((day) => (
            <section key={day.date}>
              <div className='flex items-center gap-3 mb-2'>
                <h2 className='text-sm font-semibold text-gray-500 uppercase tracking-wider'>
                  {day.date}
                </h2>
                <div className='h-px flex-1 bg-gray-200' />
                <span className='text-xs text-gray-400'>{day.jumps.length} jumps</span>
              </div>
              <div className='space-y-4'>
                {day.jumps.map((jump) => {
                  const bounds = getJumpBounds(jump)
                  return (
                    <div
                      key={jump.id}
                      className='border rounded-lg bg-white p-3'>
                      <div className='flex items-center justify-between mb-2'>
                        <h3 className='font-medium text-sm'>{jump.label}</h3>
                        <div className='flex items-center gap-3'>
                          <span className='text-xs text-gray-400'>
                            {formatTime(bounds.start)} — {formatTime(bounds.end)}
                          </span>
                          <span className='text-xs text-gray-400'>{jump.files.length} files</span>
                        </div>
                      </div>
                      <div className='space-y-0.5'>
                        {jump.files.map((file) => (
                          <FileRow
                            key={file.path}
                            file={file}
                            groupId={jump.id}
                            selected={!!selection[jump.id]?.[file.path]}
                            isInMultipleJumps={multiJumpFiles.has(file.path)}
                            onSelect={handleSelect}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {selectedCount > 0 && (
          <div className='fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg'>
            <div className='max-w-7xl mx-auto flex items-center justify-between'>
              <span className='text-sm font-medium'>
                {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
              </span>
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  onClick={() => setSelection({})}
                  className='px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded'>
                  Clear
                </button>
                <button
                  type='button'
                  disabled
                  className='px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded opacity-50 cursor-not-allowed'>
                  Move to jump...
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default Demo
