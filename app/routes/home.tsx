import { useLoaderData, Link } from 'react-router'
import type { Route } from './+types/home'
import { scanOutput } from '../lib/scanner.server'
import type { Jump } from '../lib/types'

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

const JumpCard = ({ jump }: { jump: Jump }) => (
  <Link
    to={`/jump/${jump.date}/${encodeURIComponent(jump.id.split('/')[1])}`}
    className='block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700'>
    <div className='flex items-start justify-between mb-3'>
      <div>
        <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>{jump.displayName}</h3>
        {jump.name && (
          <p className='text-sm text-gray-500 dark:text-gray-400 mt-0.5'>{jump.name}</p>
        )}
      </div>
      <div className='text-right'>
        {jump.startedAt > 0 && (
          <p className='text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums'>
            {formatTime(jump.startedAt)}
          </p>
        )}
        <p className='text-xs text-gray-400 dark:text-gray-500 tabular-nums'>
          {formatBytes(jump.totalSize)}
        </p>
      </div>
    </div>

    <div className='grid grid-cols-2 gap-3'>
      <div className='rounded-lg bg-gray-50 dark:bg-gray-800 p-3'>
        <div className='flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs mb-1'>
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
          Photos
        </div>
        <p className='text-xl font-bold text-gray-900 dark:text-white'>{jump.photoCount}</p>
      </div>
      <div className='rounded-lg bg-gray-50 dark:bg-gray-800 p-3'>
        <div className='flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs mb-1'>
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
          Videos
        </div>
        <p className='text-xl font-bold text-gray-900 dark:text-white'>{jump.videoCount}</p>
      </div>
    </div>

    {(jump.theoryPhotoCount > 0 || jump.theoryVideoCount > 0) && (
      <div className='mt-3 pt-3 border-t border-gray-100 dark:border-gray-800'>
        <p className='text-xs text-amber-600 dark:text-amber-400 font-medium'>
          Theory: {jump.theoryPhotoCount} photos, {jump.theoryVideoCount} videos
        </p>
      </div>
    )}
  </Link>
)

const loader = () => scanOutput()

const meta = ({}: Route.MetaArgs) => [
  { title: 'SkyDock - Tandem Jump Media' },
  { name: 'description', content: 'Browse your ingested tandem skydiving footage' }
]

const Home = () => {
  const days = useLoaderData<typeof loader>()

  const totalJumps = days.reduce((s, d) => s + d.jumps.length, 0)
  const totalPhotos = days.reduce((s, d) => s + d.totalPhotos, 0)
  const totalVideos = days.reduce((s, d) => s + d.totalVideos, 0)

  return (
    <div className='min-h-screen'>
      <header className='border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10'>
        <div className='max-w-5xl mx-auto px-4 py-4 flex items-center justify-between'>
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

      <main className='max-w-5xl mx-auto px-4 py-8'>
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
          days.map((day) => (
            <section
              key={day.date}
              className='mb-10'>
              <div className='flex items-center gap-3 mb-4'>
                <h2 className='text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  {day.date}
                </h2>
                <div className='h-px flex-1 bg-gray-200 dark:bg-gray-800' />
                <span className='text-xs text-gray-400 dark:text-gray-500'>
                  {day.jumps.length} jumps
                </span>
              </div>
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {day.jumps.map((jump) => (
                  <JumpCard
                    key={jump.id}
                    jump={jump}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}

export { loader, meta }
export default Home
