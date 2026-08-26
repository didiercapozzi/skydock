import { useEffect, useState } from 'react'
import { NavLink, href, useFetcher, useLoaderData, useRevalidator } from 'react-router'
import { scanOutput } from '../lib/scanner.server'
import type { FileEntry, Jump } from '../lib/types'
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

const loader = () => {
  const { days, libraryFiles } = scanOutput()
  return { days, libraryFiles }
}

const meta = (_args: Route.MetaArgs) => [
  { title: 'SkyDock - Tandem Jump Media' },
  { name: 'description', content: 'Browse your ingested tandem skydiving footage' }
]

const Home = () => {
  const { days } = useLoaderData<typeof loader>()
  const [openFile, setOpenFile] = useState<FileEntry | null>(null)
  const simulateFetcher = useFetcher()
  const { revalidate } = useRevalidator()

  const totalJumps = days.reduce((s, d) => s + d.jumps.length, 0)
  const totalPhotos = days.reduce((s, d) => s + d.totalPhotos, 0)
  const totalVideos = days.reduce((s, d) => s + d.totalVideos, 0)

  const simulating = simulateFetcher.state !== 'idle'

  useEffect(() => {
    if (simulateFetcher.state === 'idle' && simulateFetcher.data) {
      revalidate()
    }
  }, [simulateFetcher.state, simulateFetcher.data, revalidate])

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
            <NavLink to={href('/review')}>
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
          <div className='space-y-8'>
            {days.map((day) => (
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
    </div>
  )
}

export { loader, meta }
export default Home
