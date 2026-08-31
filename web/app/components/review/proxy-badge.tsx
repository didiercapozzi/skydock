import type { ManifestFile } from '../../lib/types'
import { isVideoFile } from './utils'

type ProxyBadgeProps = {
  file: ManifestFile
  variant?: 'inline' | 'overlay'
  isGenerating?: boolean
  isActive?: boolean
}

const ProxyBadge = ({
  file,
  variant = 'inline',
  isGenerating = false,
  isActive = false
}: ProxyBadgeProps) => {
  if (!isVideoFile(file.filename)) return null
  const hasProxy = !!file.proxyPath
  if (hasProxy) {
    return variant === 'overlay' ? (
      <div
        className='absolute bottom-6 left-1 text-[7px] font-medium bg-green-600 text-white rounded px-1 py-0.5 leading-none shadow-sm'
        title='Proxy ready (480p) — preview will use proxy'>
        480p
      </div>
    ) : (
      <span
        className='shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800'
        title='Proxy ready (480p) — preview will use proxy'>
        <span className='w-1 h-1 rounded-full bg-green-600 dark:bg-green-400' />
        480p
      </span>
    )
  }
  if (isActive) {
    return variant === 'overlay' ? (
      <div
        className='absolute bottom-6 left-1 inline-flex items-center gap-0.5 text-[7px] font-medium bg-amber-500 text-white rounded px-1 py-0.5 leading-none shadow-sm'
        title='Proxy encoding right now — preview uses original'>
        <span className='w-2 h-2 border border-white/40 border-t-white rounded-full animate-spin' />
        enc
      </div>
    ) : (
      <span
        className='shrink-0 inline-flex items-center gap-1 text-[9px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        title='Proxy encoding right now — preview uses original'>
        <span className='w-2 h-2 border border-amber-400 border-t-amber-700 dark:border-amber-600 dark:border-t-amber-300 rounded-full animate-spin' />
        enc
      </span>
    )
  }
  if (isGenerating) {
    return variant === 'overlay' ? (
      <div
        className='absolute bottom-6 left-1 text-[7px] font-medium bg-gray-500 text-white rounded px-1 py-0.5 leading-none shadow-sm'
        title='Proxy queued — waiting to encode, preview uses original'>
        queued
      </div>
    ) : (
      <span
        className='shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
        title='Proxy queued — waiting to encode, preview uses original'>
        <span className='w-1 h-1 rounded-full bg-gray-400' />
        queued
      </span>
    )
  }
  return variant === 'overlay' ? (
    <div
      className='absolute bottom-6 left-1 text-[7px] font-medium bg-red-600 text-white rounded px-1 py-0.5 leading-none shadow-sm'
      title='Proxy failed or not generated — preview uses original'>
      no proxy
    </div>
  ) : (
    <span
      className='shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'
      title='Proxy failed or not generated — preview uses original'>
      <span className='w-1 h-1 rounded-full bg-red-600 dark:bg-red-400' />
      no proxy
    </span>
  )
}

export { ProxyBadge }
