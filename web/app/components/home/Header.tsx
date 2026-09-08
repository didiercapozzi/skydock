import { Link } from 'react-router'

type Props = {
  nasConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
}

const Header = ({ nasConnected, onConnect, onDisconnect }: Props) => {
  return (
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
          <div className='flex items-center gap-2'>
            <div
              className={`w-2 h-2 rounded-full ${nasConnected ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className='text-xs text-gray-500'>
              {nasConnected ? 'NAS Connected' : 'NAS Disconnected'}
            </span>
            {nasConnected ? (
              <button
                type='button'
                onClick={onDisconnect}
                className='text-xs text-red-600 hover:text-red-800 font-medium'>
                Disconnect
              </button>
            ) : (
              <button
                type='button'
                onClick={onConnect}
                className='text-xs text-blue-600 hover:text-blue-800 font-medium'>
                Connect
              </button>
            )}
          </div>
          <button
            type='button'
            disabled
            className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg opacity-50 cursor-not-allowed shadow-sm'>
            Scan
          </button>
        </div>
      </div>
    </header>
  )
}

export { Header }
export type { Props }
