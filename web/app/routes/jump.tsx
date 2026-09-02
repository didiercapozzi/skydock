import { useLoaderData, Link, useFetcher, href } from 'react-router'
import type { Route } from './+types/jump'
import { getJump, getOutputDirPath } from '../lib/scanner.server'
import type { FileEntry, Jump } from '../lib/types'

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const TheoryToggle = ({ file, jumpId }: { file: FileEntry; jumpId: string }) => {
  const fetcher = useFetcher()
  const optimistic = fetcher.formData
    ? fetcher.formData.get('isInLibrary') === 'true'
    : file.isTheory

  return (
    <fetcher.Form
      method='post'
      action='/api/library'>
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
        name='isInLibrary'
        value={optimistic ? 'false' : 'true'}
      />
      <input
        type='hidden'
        name='jumpId'
        value={jumpId}
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

const ApplyButton = ({ jump }: { jump: Jump }) => {
  const fetcher = useFetcher()
  const busy = fetcher.state !== 'idle'

  return (
    <fetcher.Form
      method='post'
      action='/api/library'>
      <input
        type='hidden'
        name='action'
        value='apply'
      />
      <input
        type='hidden'
        name='sourceJump'
        value={jump.id.split('/')[1]}
      />
      <input
        type='hidden'
        name='sourceJumpDate'
        value={jump.date}
      />
      <button
        type='submit'
        disabled={busy}
        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition disabled:opacity-50 cursor-pointer'>
        <svg
          className='w-3.5 h-3.5'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={2}>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4'
          />
        </svg>
        {busy ? 'Applying...' : 'Apply theory to all jumps'}
      </button>
    </fetcher.Form>
  )
}

const FileTable = ({
  files,
  label,
  icon,
  jumpId,
  showToggles
}: {
  files: FileEntry[]
  label: string
  icon: React.ReactNode
  jumpId: string
  showToggles: boolean
}) => {
  if (files.length === 0) return null
  return (
    <div>
      <div className='flex items-center gap-2 mb-2'>
        {icon}
        <h3 className='text-sm font-semibold text-gray-700 dark:text-gray-300'>{label}</h3>
        <span className='text-xs text-gray-400 dark:text-gray-500'>({files.length})</span>
      </div>
      <div className='rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-gray-50 dark:bg-gray-800/50'>
              <th className='text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400'>
                Filename
              </th>
              <th className='text-right px-4 py-2 font-medium text-gray-500 dark:text-gray-400'>
                Size
              </th>
              {showToggles && (
                <th className='w-24 px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-center'>
                  Theory
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {files.map((f, i) => (
              <tr
                key={f.name}
                className={
                  f.isTheory
                    ? 'bg-amber-50/50 dark:bg-amber-900/10'
                    : i % 2 === 0
                      ? 'bg-white dark:bg-gray-900'
                      : 'bg-gray-50/50 dark:bg-gray-800/30'
                }>
                <td className='px-4 py-2 font-mono text-xs text-gray-900 dark:text-gray-200'>
                  <span className='flex items-center gap-2'>{f.name}</span>
                </td>
                <td className='px-4 py-2 text-right text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap'>
                  {formatBytes(f.size)}
                </td>
                {showToggles && (
                  <td className='px-4 py-2 text-center'>
                    <TheoryToggle
                      file={f}
                      jumpId={jumpId}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const loader = ({ params }: Route.LoaderArgs) => {
  const jump = getJump(params.date, params.jumpDir)
  if (!jump) throw new Response('Jump not found', { status: 404, statusText: 'Jump not found' })
  const outputDir = getOutputDirPath()
  return { jump, outputDir }
}

const meta = ({ params }: Route.MetaArgs) => [
  { title: 'Jump - SkyDock' },
  { name: 'description', content: `Media for jump on ${params.date}` }
]

type JumpDetailProps = { loaderData?: Route.ComponentProps['loaderData'] }

const JumpDetail = ({ loaderData: propLoaderData }: JumpDetailProps) => {
  let hookData: Route.ComponentProps['loaderData'] | undefined
  try {
    hookData = useLoaderData<typeof loader>() as Route.ComponentProps['loaderData']
  } catch {
    hookData = undefined
  }
  const loaderData = propLoaderData ?? hookData
  const jump = loaderData?.jump
  if (!jump) throw new Response('Jump not found', { status: 404, statusText: 'Jump not found' })
  void loaderData?.outputDir

  return (
    <div className='min-h-screen'>
      <header className='border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10'>
        <div className='max-w-5xl mx-auto px-4 py-4 flex items-center gap-4'>
          <Link
            to={href('/')}
            className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition'>
            <svg
              className='w-5 h-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </Link>
          <div className='flex items-center gap-3 flex-1'>
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
            <div>
              <h1 className='text-xl font-bold text-gray-900 dark:text-white'>
                {jump.name || jump.displayName}
              </h1>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Jump {jump.num} &middot; {jump.date}
              </p>
            </div>
          </div>
          <ApplyButton jump={jump} />
        </div>
      </header>

      <main className='max-w-5xl mx-auto px-4 py-8 space-y-8'>
        <div className='flex items-center gap-6 text-sm'>
          <span className='text-gray-500 dark:text-gray-400'>
            <span className='font-semibold text-gray-900 dark:text-white'>{jump.date}</span>
          </span>
          <span className='text-gray-300 dark:text-gray-700'>|</span>
          <span className='text-gray-500 dark:text-gray-400'>
            {jump.photoCount + jump.theoryPhotoCount} photos,{' '}
            {jump.videoCount + jump.theoryVideoCount} videos
          </span>
          <span className='text-gray-300 dark:text-gray-700'>|</span>
          <span className='text-gray-500 dark:text-gray-400'>{formatBytes(jump.totalSize)}</span>
        </div>

        <FileTable
          files={jump.jumpPhotos}
          label='Jump Photos'
          jumpId={jump.id}
          showToggles={true}
          icon={
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
          }
        />

        <FileTable
          files={jump.theoryPhotos}
          label='Theory Photos'
          jumpId={jump.id}
          showToggles={true}
          icon={
            <svg
              className='w-4 h-4 text-amber-500'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
              />
            </svg>
          }
        />

        <FileTable
          files={jump.jumpVideos}
          label='Jump Videos'
          jumpId={jump.id}
          showToggles={true}
          icon={
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
          }
        />

        <FileTable
          files={jump.theoryVideos}
          label='Theory Videos'
          jumpId={jump.id}
          showToggles={true}
          icon={
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
          }
        />
      </main>
    </div>
  )
}

export { loader, meta }
export default JumpDetail
