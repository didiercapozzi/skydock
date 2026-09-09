import { GridIcon, ListIcon } from '../icons'

type Props = {
  jumpCount: number
  fileCount: number
  compareIds: string[]
  viewMode: 'list' | 'grid'
  onViewModeChange: (mode: 'list' | 'grid') => void
  onClearCompare: () => void
  onShowComparison: () => void
}

const ReviewHeader = ({
  jumpCount,
  fileCount,
  compareIds,
  viewMode,
  onViewModeChange,
  onClearCompare,
  onShowComparison
}: Props) => {
  return (
    <>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-3xl font-bold text-gray-900'>Review Proposed Jumps</h1>
          <p className='text-gray-500 mt-2'>
            2026-08-24 — {jumpCount} jumps, {fileCount} files
          </p>
        </div>
        <div className='flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1'>
          <button
            type='button'
            aria-label='List view'
            onClick={() => onViewModeChange('list')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <ListIcon className='w-3.5 h-3.5' />
            List
          </button>
          <button
            type='button'
            aria-label='Grid view'
            onClick={() => onViewModeChange('grid')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <GridIcon className='w-3.5 h-3.5' />
            Grid
          </button>
        </div>
        {compareIds.length > 0 && (
          <div className='flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2'>
            <span className='text-sm font-medium text-blue-700'>
              {compareIds.length} jump{compareIds.length !== 1 ? 's' : ''} selected
            </span>
            <button
              type='button'
              onClick={onClearCompare}
              className='text-xs text-blue-600 hover:text-blue-800 font-medium'>
              Clear
            </button>
            {compareIds.length === 2 && (
              <button
                type='button'
                onClick={onShowComparison}
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
    </>
  )
}

export { ReviewHeader }
export type { Props }
