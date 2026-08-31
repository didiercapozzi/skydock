import { useEffect, useState } from 'react'
import type { ManifestFile } from '../../lib/types'
import { isVideoFile } from './utils'

type MediaPreviewProps = {
  file: ManifestFile
  maxHeight?: string
  videoRef?: React.RefObject<HTMLVideoElement | null>
  onDurationLoaded?: (duration: number) => void
}

const MediaPreview = ({
  file,
  maxHeight = '60vh',
  videoRef,
  onDurationLoaded
}: MediaPreviewProps) => {
  const proxySrc = file.proxyPath ? `/api/file?path=${encodeURIComponent(file.proxyPath)}` : null
  const originalSrc = `/api/file?path=${encodeURIComponent(file.path)}`
  const [forceOriginal, setForceOriginal] = useState(false)
  const useProxy = !!proxySrc && !forceOriginal
  const src = useProxy && proxySrc ? proxySrc : originalSrc
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(() => isVideoFile(file.filename))
  const [retryKey, setRetryKey] = useState(0)
  useEffect(() => {
    if (!isVideoFile(file.filename) || !isLoading) return
    const t = window.setTimeout(() => {
      setVideoError(
        'Loading timeout — file may be very large (moov at end) or codec unsupported. Try Open.'
      )
    }, 8000)
    return () => window.clearTimeout(t)
  }, [file.filename, isLoading, retryKey])
  const displaySrc = retryKey ? `${src}&retry=${retryKey}` : src
  const fallbackSrc = proxySrc && useProxy ? originalSrc : null
  return isVideoFile(file.filename) ? (
    <div
      className='relative max-w-full'
      style={{ maxHeight }}>
      {isLoading && !videoError && (
        <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 rounded text-white text-xs p-4'>
          <div className='w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin' />
          <span>Loading video… {useProxy && proxySrc ? '(proxy)' : ''}</span>
          <span className='text-[10px] text-white/60 text-center max-w-[280px]'>
            Large files (3 GB+) with moov at end need to fetch tail via Range — can take 5-10 s. If
            stuck, use Open.
          </span>
        </div>
      )}
      {videoError ? (
        <div
          className='flex flex-col items-center justify-center gap-3 bg-gray-900 text-white rounded p-6 text-center'
          style={{ minHeight: 200, maxHeight }}>
          <p className='text-sm font-medium'>Video failed to load</p>
          <p className='text-xs text-white/70 max-w-[320px]'>{videoError}</p>
          <p className='text-[11px] text-white/50'>
            Codec: h264 High usually works; HEVC/h265 fails in Firefox/Chrome without hardware. 4 GB
            files may exceed browser memory.
          </p>
          <div className='flex gap-2'>
            <a
              href={src}
              target='_blank'
              rel='noreferrer'
              className='text-xs px-3 py-1.5 rounded bg-white text-gray-900 hover:bg-gray-100'>
              Open / Download
            </a>
            <button
              type='button'
              onClick={() => {
                setVideoError(null)
                setIsLoading(true)
                setRetryKey((k) => k + 1)
              }}
              className='text-xs px-3 py-1.5 rounded border border-white/20 hover:bg-white/10'>
              Retry
            </button>
            {fallbackSrc && (
              <button
                type='button'
                onClick={() => {
                  setForceOriginal(true)
                  setVideoError(null)
                  setIsLoading(true)
                  setRetryKey((k) => k + 1)
                }}
                className='text-xs px-3 py-1.5 rounded border border-white/20 hover:bg-white/10'>
                Try original
              </button>
            )}
          </div>
        </div>
      ) : (
        <video
          key={`${file.path}-${retryKey}-${useProxy ? 'proxy' : 'orig'}`}
          ref={videoRef}
          src={displaySrc}
          controls
          autoPlay
          muted
          playsInline
          preload='metadata'
          className='max-w-full rounded bg-black'
          style={{ maxHeight }}
          onLoadedData={() => setIsLoading(false)}
          onLoadedMetadata={(e) => {
            setIsLoading(false)
            onDurationLoaded?.(e.currentTarget.duration)
            const v = e.currentTarget
            const p = v.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          }}
          onCanPlay={() => setIsLoading(false)}
          onError={() => {
            if (useProxy && proxySrc) {
              setForceOriginal(true)
              setIsLoading(true)
              setRetryKey((k) => k + 1)
              return
            }
            setIsLoading(false)
            setVideoError(
              'Browser cannot decode this file. Try Open in native player or re-encode with faststart.'
            )
          }}
          onStalled={() => {
            if (useProxy && proxySrc) {
              setForceOriginal(true)
              setIsLoading(true)
              setRetryKey((k) => k + 1)
              return
            }
            setVideoError('Stalled — Range request failed or file moved. Retry or Open.')
          }}
        />
      )}
    </div>
  ) : (
    <img
      key={file.path}
      src={src}
      alt={file.filename}
      className='max-w-full rounded object-contain'
      style={{ maxHeight }}
    />
  )
}

export { MediaPreview }
