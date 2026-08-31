import type { ManifestFile } from '../../lib/types'
import { isVideoFile } from './utils'

type ProxyBadgeProps = {
  file: ManifestFile
  variant?: 'inline' | 'overlay'
}

const ProxyBadge = ({ file, variant = 'inline' }: ProxyBadgeProps) => {
  if (!isVideoFile(file.filename)) return null
  const hasProxy = !!file.proxyPath
  if (variant === 'overlay') {
    return hasProxy ? (
      <div
        className='absolute bottom-6 left-1 text-[7px] font-medium bg-green-600 text-white rounded px-1 py-0.5 leading-none shadow-sm'
        title='Proxy ready (480p)'>
        480p
      </div>
    ) : (
      <div
        className='absolute bottom-6 left-1 text-[7px] font-medium bg-amber-500 text-white rounded px-1 py-0.5 leading-none shadow-sm'
        title='Proxy pending — generating'>
        no proxy
      </div>
    )
  }
  return hasProxy ? (
    <span
      className='shrink-0 text-[9px] font-medium px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800'
      title='Proxy ready (480p)'>
      480p
    </span>
  ) : (
    <span
      className='shrink-0 text-[9px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
      title='Proxy pending — generating'>
      no proxy
    </span>
  )
}

export { ProxyBadge }
