import { useState, useCallback } from 'react'
import { useLoaderData, useFetcher } from 'react-router'
import type { Route } from './+types/home'
import { scanOutput } from '../lib/scanner.server'
import type { Jump, FileEntry, TheoryVideoWithSource } from '../lib/types'

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const formatTime = (epoch: number): string => {
  if (epoch === 0) return ''
  const d = new Date(epoch * 1000)
  return d.toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich'
  })
}

const TheoryToggle = ({ file }: { file: FileEntry }) => {
  const fetcher = useFetcher()
  const optimistic = fetcher.formData ? fetcher.formData.get('isTheory') === 'true' : file.isTheory

  return (
    <fetcher.Form
      method='post'
      action='/api/theory'>
      <input
        type='hidden'
        name='action'
        value='toggle'
      />
      <input
        type='hidden'
        name='filePath'
        value={file.path}
      />
      <input
        type='hidden'
        name='isTheory'
        value={optimistic ? 'false' : 'true'}
      />
      <button
        type='submit'
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition cursor-pointer ${
          optimistic
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}>
        {optimistic ? 'Theory' : 'Mark theory'}
      </button>
    </fetcher.Form>
  )
}

const NameEditor = ({
  jumpDate,
  jumpDir,
  currentName,
  onRename
}: {
  jumpDate: string
  jumpDir: string
  currentName: string | null
  onRename: (newName: string | null) => void
}) => {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName ?? '')
  const fetcher = useFetcher()

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (trimmed === (currentName ?? '')) {
      setEditing(false)
      return
    }
    fetcher.submit(
      { action: 'rename', date: jumpDate, jumpDir, newName: trimmed },
      { method: 'post', action: '/api/jump' }
    )
    onRename(trimmed || null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type='button'
        onClick={() => setEditing(true)}
        className='text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition inline-flex items-center gap-1 group cursor-pointer'>
        {currentName ?? <span className='italic'>Add name</span>}
        <svg
          className='w-3 h-3 opacity-0 group-hover:opacity-100 transition'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={2}>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'
          />
        </svg>
      </button>
    )
  }

  return (
    <input
      autoFocus
      type='text'
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSubmit()
        if (e.key === 'Escape') {
          setValue(currentName ?? '')
          setEditing(false)
        }
      }}
      className='text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
      placeholder='Passenger name'
    />
  )
}

const TheorySidebar = ({
  theoryVideos,
  selectedDate
}: {
  theoryVideos: TheoryVideoWithSource[]
  selectedDate: string | null
}) => {
  const grouped = theoryVideos.reduce<Record<string, TheoryVideoWithSource[]>>((acc, v) => {
    const date = v.jumpDate || 'unknown'
    if (!acc[date]) acc[date] = []
    acc[date].push(v)
    return acc
  }, {})

  const dates = Object.keys(grouped).sort().reverse()
  const filtered = selectedDate
    ? theoryVideos.filter((v) => v.jumpDate === selectedDate)
    : theoryVideos

  return (
    <div className='w-64 shrink-0 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-4'>
      <div className='flex items-center gap-2 mb-4'>
        <svg
          className='w-4 h-4 text-amber-500'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={2}>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z'
          />
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
          />
        </svg>
        <h2 className='text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider'>
          Theory
        </h2>
        <span className='text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium'>
          {filtered.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className='text-xs text-gray-400 dark:text-gray-500 italic'>
          Mark videos as theory to see them here
        </p>
      ) : (
        <div className='space-y-3'>
          {dates.map((date) => {
            const videos = selectedDate
              ? (grouped[date]?.filter((v) => v.jumpDate === date) ?? [])
              : (grouped[date] ?? [])
            if (selectedDate && date !== selectedDate) return null
            return (
              <div key={date}>
                {!selectedDate && (
                  <p className='text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1'>
                    {date}
                  </p>
                )}
                <div className='space-y-1'>
                  {videos.map((v) => (
                    <div
                      key={v.path}
                      draggable='true'
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify(v))
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      className='flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-900/50 cursor-grab hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition active:cursor-grabbing'>
                      <svg
                        className='w-3 h-3 text-amber-500 shrink-0'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                        strokeWidth={2}>
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          d='M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4'
                        />
                      </svg>
                      <span className='text-xs font-mono text-gray-700 dark:text-gray-300 truncate'>
                        {v.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const JumpRow = ({
  jump,
  expandedSection,
  onToggleSection,
  onDrop
}: {
  jump: Jump
  expandedSection: 'photos' | 'videos' | null
  onToggleSection: (section: 'photos' | 'videos') => void
  onDrop: (theoryPath: string) => void
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const fetcher = useFetcher()

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'))
        if (data.path) {
          fetcher.submit(
            {
              action: 'copy-to-jump',
              theoryPath: data.path,
              targetDate: jump.date,
              targetJumpDir: jump.id.split('/')[1]
            },
            { method: 'post', action: '/api/theory' }
          )
          onDrop(data.path)
        }
      } catch {
        // ignore
      }
    },
    [fetcher, jump, onDrop]
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border transition ${
        isDragOver
          ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 shadow-md'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
      }`}>
      <div className='px-4 py-3 flex items-center gap-4'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-semibold text-gray-900 dark:text-white'>
              {jump.displayName}
            </h3>
            <NameEditor
              jumpDate={jump.date}
              jumpDir={jump.id.split('/')[1]}
              currentName={jump.name}
              onRename={() => {}}
            />
          </div>
          {jump.startedAt > 0 && (
            <p className='text-xs text-gray-400 dark:text-gray-500 tabular-nums'>
              {formatTime(jump.startedAt)}
            </p>
          )}
        </div>

        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => onToggleSection('photos')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              expandedSection === 'photos'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}>
            <svg
              className='w-3.5 h-3.5'
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
            {jump.photoCount}
          </button>

          <button
            type='button'
            onClick={() => onToggleSection('videos')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              expandedSection === 'videos'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}>
            <svg
              className='w-3.5 h-3.5'
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
            {jump.videoCount}
          </button>
        </div>

        <p className='text-xs text-gray-400 dark:text-gray-500 tabular-nums w-16 text-right'>
          {formatBytes(jump.totalSize)}
        </p>
      </div>

      {expandedSection === 'photos' && jump.jumpPhotos.length > 0 && (
        <div className='border-t border-gray-100 dark:border-gray-800 px-4 py-3'>
          <div className='flex items-center gap-2 mb-2'>
            <svg
              className='w-4 h-4 text-blue-500'
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
            <h4 className='text-xs font-semibold text-gray-700 dark:text-gray-300'>Photos</h4>
            <span className='text-[10px] text-gray-400 dark:text-gray-500'>
              ({jump.jumpPhotos.length})
            </span>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2'>
            {jump.jumpPhotos.map((f) => (
              <div
                key={f.name}
                className='flex items-center justify-between px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800 text-xs'>
                <span className='font-mono text-gray-700 dark:text-gray-300 truncate'>
                  {f.name}
                </span>
                <TheoryToggle file={f} />
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedSection === 'videos' && jump.jumpVideos.length > 0 && (
        <div className='border-t border-gray-100 dark:border-gray-800 px-4 py-3'>
          <div className='flex items-center gap-2 mb-2'>
            <svg
              className='w-4 h-4 text-purple-500'
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
            <h4 className='text-xs font-semibold text-gray-700 dark:text-gray-300'>Videos</h4>
            <span className='text-[10px] text-gray-400 dark:text-gray-500'>
              ({jump.jumpVideos.length})
            </span>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2'>
            {jump.jumpVideos.map((f) => (
              <div
                key={f.name}
                className='flex items-center justify-between px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800 text-xs'>
                <span className='font-mono text-gray-700 dark:text-gray-300 truncate'>
                  {f.name}
                </span>
                <TheoryToggle file={f} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const loader = () => {
  const { days, theoryVideos } = scanOutput()
  return { days, theoryVideos }
}

const meta = (_args: Route.MetaArgs) => [
  { title: 'SkyDock - Tandem Jump Media' },
  { name: 'description', content: 'Browse your ingested tandem skydiving footage' }
]

const Home = () => {
  const { days, theoryVideos } = useLoaderData<typeof loader>()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<'photos' | 'videos' | null>(null)

  const totalJumps = days.reduce((s, d) => s + d.jumps.length, 0)
  const totalPhotos = days.reduce((s, d) => s + d.totalPhotos, 0)
  const totalVideos = days.reduce((s, d) => s + d.totalVideos, 0)

  const selectedDate = expandedId?.split('/')[0] ?? null

  return (
    <div className='min-h-screen'>
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
            <h1 className='text-xl font-bold text-gray-900 dark:text-white'>SkyDock</h1>
          </div>
          <div className='flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400'>
            <span>{totalJumps} jumps</span>
            <span>{totalPhotos} photos</span>
            <span>{totalVideos} videos</span>
          </div>
        </div>
      </header>

      <div className='max-w-7xl mx-auto flex'>
        <TheorySidebar
          theoryVideos={theoryVideos}
          selectedDate={selectedDate}
        />

        <main className='flex-1 min-w-0 px-6 py-6'>
          {days.length === 0 ? (
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
            <div className='space-y-6'>
              {days.map((day) => (
                <section key={day.date}>
                  <div className='flex items-center gap-3 mb-3'>
                    <h2 className='text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                      {day.date}
                    </h2>
                    <div className='h-px flex-1 bg-gray-200 dark:bg-gray-800' />
                    <span className='text-xs text-gray-400 dark:text-gray-500'>
                      {day.jumps.length} jumps
                    </span>
                  </div>
                  <div className='space-y-3'>
                    {day.jumps.map((jump) => (
                      <JumpRow
                        key={jump.id}
                        jump={jump}
                        expandedSection={expandedId === jump.id ? expandedSection : null}
                        onToggleSection={(section) => {
                          if (expandedId === jump.id && expandedSection === section) {
                            setExpandedId(null)
                            setExpandedSection(null)
                          } else {
                            setExpandedId(jump.id)
                            setExpandedSection(section)
                          }
                        }}
                        onDrop={() => {}}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export { loader, meta }
export default Home
